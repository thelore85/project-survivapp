import { describe, expect, it } from 'vitest';
import {
  Catalogue,
  FakeLlm,
  FakeVisionEmbedder,
  checkImageQuality,
  describeSpecies,
  identifyFromPhoto,
  type LlmRequest,
} from '../src';
import { GREEN, RED, flatImage, makeDb, seedCatalogue, texturedImage } from './helpers';

async function setup(script?: (request: LlmRequest) => string | undefined) {
  const vision = new FakeVisionEmbedder();
  const catalogue = new Catalogue(await makeDb());
  await seedCatalogue(catalogue, vision);
  return { catalogue, vision, llm: new FakeLlm(script) };
}

describe('qualità della foto', () => {
  it('accetta una foto leggibile', () => {
    expect(checkImageQuality(texturedImage(RED))).toEqual([]);
  });

  it('rifiuta foto troppo piccole, scure, sovraesposte o piatte', () => {
    expect(checkImageQuality(texturedImage(RED, 64))).toEqual(['too_small']);
    expect(checkImageQuality(flatImage(5))).toEqual(['too_dark', 'low_contrast']);
    expect(checkImageQuality(flatImage(250))).toEqual(['too_bright', 'low_contrast']);
    expect(checkImageQuality(flatImage(120))).toEqual(['low_contrast']);
  });
});

describe('flusso botanico da fotografia', () => {
  it('una foto avvia la pipeline e restituisce candidati collegati alle schede', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'it' });

    expect(answer.status).toBe('candidates');
    expect(answer.candidates.length).toBeGreaterThan(1);
    expect(answer.candidates[0]).toMatchObject({ id: 'amanita-muscaria', rank: 1, commonName: 'Ovolo malefico' });
    for (const candidate of answer.candidates) {
      expect(await deps.catalogue.get(candidate.id)).not.toBeNull();
      expect(candidate.sources.length).toBeGreaterThan(0);
    }
  });

  it('espone limiti, alternative e dettagli da fotografare', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'it' });
    const codes = answer.notices.map((notice) => notice.code);

    expect(codes).toContain('notice.identification_uncertain');
    expect(codes).toContain('notice.similarity_not_probability');
    expect(codes).toContain('notice.no_consumption');
    expect(codes).toContain('notice.dangerous_candidates');
    expect(answer.candidates[0]?.lookalikes.map((lookalike) => lookalike.id)).toEqual(['amanita-caesarea']);
    expect(answer.candidates[0]?.featuresToVerify).toContainEqual({ name: 'capShape', value: 'convex' });
    expect(answer.requestedDetails.length).toBeGreaterThan(0);
    expect(answer.blocks.map((block) => block.provenance)).toContain('catalogue');
  });

  it('nessuna risposta contiene percentuali o punteggi di confidenza', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'en' });
    const serialized = JSON.stringify(answer);
    expect(serialized).not.toMatch(/\d\s?%/);
    expect(serialized).not.toMatch(/cosine|confidence|score/i);
  });

  it('non dichiara commestibilità: toglie la frase anche dalla scheda', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'en' });
    const caesarea = answer.candidates.find((candidate) => candidate.id === 'amanita-caesarea');
    expect(caesarea?.description).toBe('A mushroom with an orange cap and yellow gills. It grows in oak woods.');
    expect(JSON.stringify(answer)).not.toMatch(/\bedible mushroom\b/);
  });

  it.each([
    ['commestibilità', 'This is Amanita caesarea, it is edible and delicious.'],
    ['certezza', 'È sicuramente Amanita muscaria.'],
    ['percentuale', 'Amanita muscaria (confidence 93%).'],
    ['innocuità', 'This species is harmless.'],
  ])('scarta la spiegazione generata che viola la policy: %s', async (_name, output) => {
    const deps = await setup(() => output);
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'it' });
    expect(answer.status).toBe('candidates');
    expect(answer.blocks.every((block) => block.provenance !== 'generated')).toBe(true);
    expect(answer.notices.map((notice) => notice.code)).toContain('notice.generated_removed');
    expect(JSON.stringify(answer)).not.toContain(output);
  });

  it('tiene una spiegazione prudente e la marca come generata', async () => {
    const deps = await setup(() => 'Il cappello rosso è compatibile con più specie: controlla lamelle e base del gambo.');
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'it' });
    expect(answer.blocks.at(-1)).toMatchObject({ provenance: 'generated' });
  });

  it('chiede un’altra foto se l’immagine non è leggibile', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: flatImage(5), lang: 'it' });
    expect(answer.status).toBe('retake_photo');
    expect(answer.imageIssues).toContain('immagine troppo scura');
    expect(answer.candidates).toEqual([]);
  });

  it('limita il confronto al gruppo indicato dall’utente', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto(deps, { image: texturedImage(RED, 256, 3), lang: 'it', kind: 'plant' });
    expect(answer.candidates.map((candidate) => candidate.id)).toEqual(['urtica-dioica']);
  });

  it('dichiara non disponibile il confronto se manca il modello o il catalogo è di un altro modello', async () => {
    const deps = await setup();
    const noVision = await identifyFromPhoto({ ...deps, vision: null }, { image: texturedImage(GREEN), lang: 'it' });
    expect(noVision.status).toBe('unavailable');

    await deps.catalogue.setVisionModel('bioclip-2');
    const mismatch = await identifyFromPhoto(deps, { image: texturedImage(GREEN), lang: 'it' });
    expect(mismatch.status).toBe('unavailable');
  });

  it('dichiara quando nessuna specie supera la soglia di somiglianza del modello', async () => {
    const deps = await setup();
    const strict = Object.assign(new FakeVisionEmbedder(), { relevanceThreshold: 0.999 });
    const answer = await identifyFromPhoto({ ...deps, vision: strict }, { image: texturedImage([40, 60, 200], 256, 9), lang: 'it' });
    expect(answer.status).toBe('no_candidates');
    expect(answer.candidates).toEqual([]);
  });

  it('funziona senza modello linguistico: restano candidati e avvisi', async () => {
    const deps = await setup();
    const answer = await identifyFromPhoto({ ...deps, llm: null }, { image: texturedImage(GREEN, 256, 3), lang: 'es' });
    expect(answer.candidates[0]?.id).toBe('urtica-dioica');
    expect(answer.notices.length).toBeGreaterThan(0);
  });
});

describe('domande testuali sulle specie', () => {
  it('trova la scheda dal nome comune in un’altra lingua', async () => {
    const deps = await setup();
    const answer = await describeSpecies(deps, { question: 'dove cresce l’ortica?', lang: 'it' });
    expect(answer.status).toBe('species_info');
    expect(answer.candidates.map((candidate) => candidate.id)).toEqual(['urtica-dioica']);
    expect(answer.notices.map((notice) => notice.code)).toContain('notice.no_warning_not_safe');
  });

  it('usa le specie del contesto quando la domanda non ne nomina', async () => {
    const deps = await setup();
    const answer = await describeSpecies(deps, { question: 'qual è il suo habitat?', lang: 'it', speciesIds: ['amanita-muscaria'] });
    expect(answer.candidates.map((candidate) => candidate.id)).toEqual(['amanita-muscaria']);
  });

  it('dichiara quando il catalogo non ha la specie', async () => {
    const deps = await setup();
    const answer = await describeSpecies(deps, { question: 'posso mangiare la mandragora?', lang: 'it' });
    expect(answer.status).toBe('no_candidates');
    expect(answer.notices[0]?.code).toBe('notice.no_consumption');
  });
});
