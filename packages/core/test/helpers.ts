import {
  Catalogue,
  ConversationStore,
  FakeLlm,
  FakeTextEmbedder,
  FakeVisionEmbedder,
  LibraryStore,
  ModelManager,
  Orchestrator,
  migrate,
  type LlmRequest,
  type RgbaImage,
  type SpeciesRecord,
} from '../src';
import { NodeSqlDb } from '../src/node';

export async function makeDb(): Promise<NodeSqlDb> {
  const db = new NodeSqlDb();
  await migrate(db);
  return db;
}

/** Immagine sintetica con trama: colore di base più rumore deterministico, così supera i controlli qualità. */
export function texturedImage(base: [number, number, number], size = 256, seed = 1): RgbaImage {
  const data = new Uint8Array(size * size * 4);
  let state = seed;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  for (let i = 0; i < size * size; i++) {
    const noise = (random() - 0.5) * 120;
    data[i * 4] = Math.max(0, Math.min(255, base[0] + noise));
    data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + noise));
    data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + noise));
    data[i * 4 + 3] = 255;
  }
  return { width: size, height: size, data };
}

export function flatImage(value: number, size = 256): RgbaImage {
  const data = new Uint8Array(size * size * 4).fill(value);
  return { width: size, height: size, data };
}

export const RED: [number, number, number] = [190, 50, 40];
export const GREEN: [number, number, number] = [60, 150, 60];
export const YELLOW: [number, number, number] = [210, 190, 60];

function species(partial: Partial<SpeciesRecord> & Pick<SpeciesRecord, 'id' | 'scientificName' | 'kind'>): SpeciesRecord {
  return {
    taxonomy: {},
    commonNames: { it: [], en: [], es: [] },
    descriptions: {},
    features: {},
    toxicity: { level: 'none_recorded', note: null },
    lookalikes: [],
    sources: [{ name: 'Test', url: 'https://example.org', license: 'CC0' }],
    images: [{ file: `images/${partial.id}.jpg`, license: 'cc0', attribution: 'test', sourceUrl: 'https://example.org' }],
    ...partial,
  };
}

export const SPECIES: SpeciesRecord[] = [
  species({
    id: 'amanita-muscaria',
    scientificName: 'Amanita muscaria',
    kind: 'fungus',
    taxonomy: { family: 'Amanitaceae', genus: 'Amanita' },
    commonNames: { it: ['Ovolo malefico'], en: ['Fly agaric'], es: ['Matamoscas'] },
    descriptions: { en: 'A mushroom with a red cap and white warts. It grows under birch and pine.' },
    features: { capShape: 'convex', sporePrintColor: 'white' },
    toxicity: { level: 'toxic', note: { it: 'Tossico: provoca avvelenamento neurotossico.', en: 'Toxic: causes neurotoxic poisoning.' } },
    lookalikes: ['amanita-caesarea'],
  }),
  species({
    id: 'amanita-caesarea',
    scientificName: 'Amanita caesarea',
    kind: 'fungus',
    taxonomy: { family: 'Amanitaceae', genus: 'Amanita' },
    commonNames: { it: ['Ovolo buono'], en: ["Caesar's mushroom"], es: ['Oronja'] },
    descriptions: {
      en: 'A mushroom with an orange cap and yellow gills. It is a highly prized edible mushroom. It grows in oak woods.',
    },
    lookalikes: ['amanita-muscaria'],
  }),
  species({
    id: 'urtica-dioica',
    scientificName: 'Urtica dioica',
    kind: 'plant',
    taxonomy: { family: 'Urticaceae', genus: 'Urtica' },
    commonNames: { it: ['Ortica'], en: ['Stinging nettle'], es: ['Ortiga'] },
    descriptions: { en: 'A perennial plant with stinging hairs on leaves and stems. It grows in nitrogen-rich soils.' },
    toxicity: { level: 'caution', note: { en: 'Stinging hairs irritate the skin.' } },
  }),
];

const IMAGE_COLOURS: Record<string, [number, number, number]> = {
  'amanita-muscaria': RED,
  'amanita-caesarea': YELLOW,
  'urtica-dioica': GREEN,
};

export async function seedCatalogue(catalogue: Catalogue, vision: FakeVisionEmbedder): Promise<void> {
  for (const record of SPECIES) {
    const embedding = await vision.embedImage(texturedImage(IMAGE_COLOURS[record.id] ?? GREEN, 256, 7));
    await catalogue.insert(record, [embedding]);
  }
  await catalogue.setVisionModel(vision.id);
}

export const WATER_PAGES = [
  {
    page: 12,
    text:
      'WATER PURIFICATION\n\nPurify all water obtained from natural sources before drinking. ' +
      'Boil the water for at least 10 minutes to kill most organisms. ' +
      'Water purification tablets may also be used according to their instructions.',
  },
  {
    page: 13,
    text:
      'FIRE\n\nTo start a fire you need tinder, kindling and fuel. Prepare the fire lay before lighting the tinder. ' +
      'Keep the firewood dry and build the fire in a place protected from the wind.',
  },
  {
    page: 40,
    text:
      'SHELTERS\n\nA lean-to shelter is built with a ridge pole lashed between two trees and covered with boughs. ' +
      'Choose a site away from dead trees and from places that may flood.',
  },
];

export const HISTORICAL_PAGES = [
  {
    page: 5,
    text:
      'ESCULENT FUNGI\n\nThe meadow mushroom is edible and wholesome and may be eaten freely when cooked. ' +
      'Many mushrooms growing in pastures were gathered and eaten by country people.',
  },
];

export interface Harness {
  orchestrator: Orchestrator;
  conversations: ConversationStore;
  catalogue: Catalogue;
  base: LibraryStore;
  user: LibraryStore;
  llm: FakeLlm;
  embedder: FakeTextEmbedder;
  vision: FakeVisionEmbedder;
  models: ModelManager;
}

/** Ambiente completo con database in memoria, modelli finti e un piccolo corpus di prova. */
export async function makeHarness(script?: (request: LlmRequest) => string | undefined): Promise<Harness> {
  const contentDb = await makeDb();
  const userDb = await makeDb();
  const llm = new FakeLlm(script);
  const embedder = new FakeTextEmbedder();
  const vision = new FakeVisionEmbedder();
  const catalogue = new Catalogue(contentDb);
  await seedCatalogue(catalogue, vision);
  const base = new LibraryStore('base', contentDb);
  const user = new LibraryStore('user', userDb);
  await base.ingest({ id: 'fm-survival', title: 'Survival Manual', lang: 'en' }, WATER_PAGES, embedder);
  await base.ingest(
    { id: 'old-fungi', title: 'Old Fungi Book', lang: 'en', reliability: 'historical' },
    HISTORICAL_PAGES,
    embedder,
  );
  const conversations = new ConversationStore(userDb);
  const models = new ModelManager({ llm, textEmbedder: embedder, vision }, 3);
  const orchestrator = new Orchestrator({ conversations, catalogue, stores: [base, user], models });
  return { orchestrator, conversations, catalogue, base, user, llm, embedder, vision, models };
}
