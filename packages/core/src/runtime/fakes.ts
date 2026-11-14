import { parseContextBlock } from '../safety/context';
import { contentTokens } from '../text/tokens';
import type { RgbaImage } from '../types';
import { l2normalize, type LlmRequest, type LlmRuntime, type TextEmbedder, type VisionEmbedder } from './types';

abstract class FakeModel {
  private loaded = false;
  async load(): Promise<void> {
    this.loaded = true;
  }
  async unload(): Promise<void> {
    this.loaded = false;
  }
  isLoaded(): boolean {
    return this.loaded;
  }
}

function firstSentences(text: string, count: number): string {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  return sentences.slice(0, count).join(' ');
}

/**
 * LLM finto e deterministico: riassume per estrazione le fonti che trova nel prompt.
 * Con `script` un test può fargli dire qualsiasi cosa, anche una violazione delle policy.
 */
export class FakeLlm extends FakeModel implements LlmRuntime {
  readonly id = 'fake-extractive';
  readonly requests: LlmRequest[] = [];

  constructor(private readonly script?: (request: LlmRequest) => string | undefined) {
    super();
  }

  async generate(request: LlmRequest, onToken?: (token: string) => void): Promise<string> {
    this.requests.push(request);
    const output = this.script?.(request) ?? this.extractiveAnswer(request);
    for (const word of output.split(/(?<=\s)/)) onToken?.(word);
    return output;
  }

  private extractiveAnswer(request: LlmRequest): string {
    const lastUser = [...request.messages].reverse().find((message) => message.role === 'user');
    const sources = parseContextBlock(lastUser?.content ?? '');
    if (sources.length === 0) return 'Demo mode: no language model is loaded, so no generated explanation is available.';
    return sources
      .slice(0, 2)
      .map((source) => `${firstSentences(source.text, 2)} [${source.marker}]`)
      .join('\n\n');
  }
}

/** Mini glossario it/es → en: solo per rendere provabile la demo con manuali in inglese. */
const DEMO_GLOSSARY: Record<string, string> = {
  acqua: 'water', agua: 'water', potabile: 'drinking', potable: 'drinking', purificare: 'purify',
  purificar: 'purify', bollire: 'boil', hervir: 'boil', fuoco: 'fire', fuego: 'fire', accendere: 'start',
  encender: 'start', riparo: 'shelter', rifugio: 'shelter', refugio: 'shelter', costruire: 'build',
  construir: 'build', freddo: 'cold', frio: 'cold', caldo: 'heat', calor: 'heat', neve: 'snow', nieve: 'snow',
  ferita: 'wound', herida: 'wound', frattura: 'fracture', fractura: 'fracture', emorragia: 'bleeding',
  hemorragia: 'bleeding', ustione: 'burn', quemadura: 'burn', morso: 'bite', mordedura: 'bite', serpente: 'snake',
  serpiente: 'snake', cibo: 'food', comida: 'food', pianta: 'plant', piante: 'plants', planta: 'plant',
  plantas: 'plants', fungo: 'mushroom', funghi: 'mushrooms', hongo: 'mushroom', hongos: 'mushrooms', seta: 'mushroom',
  nodo: 'knot', nudo: 'knot', corda: 'rope', cuerda: 'rope', bussola: 'compass', brujula: 'compass',
  orientamento: 'navigation', orientacion: 'navigation', segnale: 'signal', segnali: 'signals', senal: 'signal',
  trappola: 'trap', trampa: 'trap', pesca: 'fishing', caccia: 'hunting', caza: 'hunting', deserto: 'desert',
  desierto: 'desert', mare: 'sea', mar: 'sea', montagna: 'mountain', montana: 'mountain', foresta: 'forest',
  bosque: 'forest', bosco: 'forest', ipotermia: 'hypothermia', hipotermia: 'hypothermia', disidratazione: 'dehydration',
  deshidratacion: 'dehydration', coltello: 'knife', cuchillo: 'knife', soccorso: 'aid', auxilios: 'aid',
  veleno: 'poison', velenoso: 'poisonous', velenosa: 'poisonous', venenoso: 'poisonous', venenosa: 'poisonous',
  foglia: 'leaf', foglie: 'leaves', hoja: 'leaf', hojas: 'leaves', albero: 'tree', arbol: 'tree', fiore: 'flower',
  flor: 'flower', alpi: 'alps', alpes: 'alps',
};

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/**
 * Embedder finto: bag-of-words con hashing. Non capisce il significato né le lingue,
 * ma è deterministico e permette di provare tutta la pipeline di retrieval.
 */
export class FakeTextEmbedder extends FakeModel implements TextEmbedder {
  readonly id = 'fake-hash-256';
  readonly dim = 256;
  readonly relevanceThreshold = 0.2;

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => {
      const vector = new Float32Array(this.dim);
      for (const raw of contentTokens(text)) {
        const token = stem(DEMO_GLOSSARY[raw] ?? raw);
        const hash = fnv1a(token);
        const index = hash % this.dim;
        vector[index] = (vector[index] ?? 0) + ((hash >>> 16) & 1 ? 1 : -1);
      }
      return l2normalize(vector);
    });
  }
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta + 6) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  return [hue / 6, max === 0 ? 0 : delta / max, max / 255];
}

/**
 * Encoder visivo finto: istogramma dei colori più colore medio su una griglia 4x4.
 * Trova immagini dall'aspetto simile, non riconosce specie.
 */
export class FakeVisionEmbedder extends FakeModel implements VisionEmbedder {
  readonly id = 'fake-colour-120';
  readonly dim = 120;
  readonly relevanceThreshold = 0.1;

  async embedImage(image: RgbaImage): Promise<Float32Array> {
    const histogram = new Float32Array(72);
    const colours = new Float32Array(48);
    const grid = 32;
    for (let gy = 0; gy < grid; gy++) {
      for (let gx = 0; gx < grid; gx++) {
        const x = Math.min(image.width - 1, Math.floor(((gx + 0.5) * image.width) / grid));
        const y = Math.min(image.height - 1, Math.floor(((gy + 0.5) * image.height) / grid));
        const offset = (y * image.width + x) * 4;
        const r = image.data[offset] ?? 0;
        const g = image.data[offset + 1] ?? 0;
        const b = image.data[offset + 2] ?? 0;
        const [h, s, v] = rgbToHsv(r, g, b);
        const bin = Math.min(7, Math.floor(h * 8)) * 9 + Math.min(2, Math.floor(s * 3)) * 3 + Math.min(2, Math.floor(v * 3));
        histogram[bin] = (histogram[bin] ?? 0) + 1;
        const cell = (Math.floor(gy / 8) * 4 + Math.floor(gx / 8)) * 3;
        colours[cell] = (colours[cell] ?? 0) + r;
        colours[cell + 1] = (colours[cell + 1] ?? 0) + g;
        colours[cell + 2] = (colours[cell + 2] ?? 0) + b;
      }
    }
    // Le due metà pesano uguale: l'istogramma distingue i colori, la griglia dà una somiglianza di fondo.
    const vector = new Float32Array(this.dim);
    vector.set(l2normalize(histogram), 0);
    vector.set(l2normalize(colours), 72);
    return l2normalize(vector);
  }
}
