import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Catalogue, FakeTextEmbedder, FakeVisionEmbedder, LibraryStore, hybridSearch, parseManifest } from '@survivapp/core';
import { NodeSqlDb } from '@survivapp/core/node';
import jpeg from 'jpeg-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPackage, type BuildResult } from '../src/build';

function jpegOf(colour: [number, number, number]): Buffer {
  const size = 200;
  const data = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const shade = (i * 37) % 90;
    data[i * 4] = Math.min(255, colour[0] + shade);
    data[i * 4 + 1] = Math.min(255, colour[1] + shade);
    data[i * 4 + 2] = Math.min(255, colour[2] + shade);
    data[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data, width: size, height: size }, 90).data;
}

describe('costruzione del pacchetto base', () => {
  let dir: string;
  let result: BuildResult;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'survivapp-pkg-'));
    const kb = path.join(dir, 'kb');
    const catalogue = path.join(dir, 'catalogue');
    await mkdir(path.join(kb, 'docs'), { recursive: true });
    await mkdir(path.join(catalogue, 'images'), { recursive: true });

    await writeFile(
      path.join(kb, 'docs/water.txt'),
      'WATER\n\nBoil water for at least 10 minutes before drinking it. Collect rain water with a tarp when possible.',
    );
    await writeFile(
      path.join(kb, 'documents.json'),
      JSON.stringify([
        { id: 'water', file: 'docs/water.txt', title: 'Water notes', lang: 'en', license: 'CC0' },
        { id: 'missing', file: 'docs/missing.pdf', title: 'Missing' },
      ]),
    );
    await writeFile(path.join(catalogue, 'images/red-cap.jpg'), jpegOf([170, 30, 30]));
    await writeFile(
      path.join(catalogue, 'species.json'),
      JSON.stringify([
        {
          id: 'red-cap',
          scientificName: 'Rubra testa',
          kind: 'fungus',
          taxonomy: { family: 'Testaceae' },
          commonNames: { it: ['Cappello rosso'], en: ['Red cap'], es: [] },
          descriptions: { en: 'A test mushroom.' },
          features: {},
          toxicity: { level: 'toxic', note: { en: 'Toxic.' } },
          lookalikes: ['not-in-catalogue'],
          sources: [{ name: 'Test', url: 'https://example.org', license: 'CC0' }],
          images: [
            { file: 'images/red-cap.jpg', license: 'cc0', attribution: 'test', sourceUrl: 'https://example.org/1' },
            { file: 'images/absent.jpg', license: 'cc0', attribution: 'test', sourceUrl: 'https://example.org/2' },
          ],
        },
      ]),
    );

    result = await buildPackage({
      knowledgeBaseDir: kb,
      catalogueDir: catalogue,
      outDir: path.join(dir, 'out'),
      packageId: 'test',
      version: '1.2.3',
      config: { defaultUserQuotaMb: 300 },
    });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('scrive un manifest valido con statistiche e configurazione', async () => {
    const manifest = parseManifest(JSON.parse(await readFile(path.join(dir, 'out/manifest.json'), 'utf8')));
    expect(manifest).toMatchObject({ id: 'test', version: '1.2.3', stats: { species: 1, documents: 1, chunks: 1 } });
    expect(manifest.config.defaultUserQuotaMb).toBe(300);
    expect(manifest.models.textEmbedder?.id).toBe('fake-hash-256');
    expect(manifest.models.vision?.id).toBe('fake-colour-120');
  });

  it('segnala ciò che manca invece di fallire', () => {
    expect(result.warnings).toContain('documento mancante, saltato: docs/missing.pdf');
    expect(result.warnings).toContain('red-cap: immagine mancante images/absent.jpg');
  });

  it('produce un database che l’app può interrogare', async () => {
    const db = new NodeSqlDb(path.join(dir, 'out/content.db'));
    const embedder = new FakeTextEmbedder();
    const { passages, semanticUsed } = await hybridSearch([new LibraryStore('base', db)], embedder, 'boil water');
    expect(semanticUsed).toBe(true);
    expect(passages[0]?.documentTitle).toBe('Water notes');

    const catalogue = new Catalogue(db);
    const record = await catalogue.get('red-cap');
    expect(record?.images).toHaveLength(1);
    expect(record?.lookalikes).toEqual([]);
    expect(await catalogue.visionModel()).toBe('fake-colour-120');

    const vision = new FakeVisionEmbedder();
    const decoded = jpeg.decode(jpegOf([170, 30, 30]), { useTArray: true });
    const matches = await catalogue.visualSearch(await vision.embedImage(decoded), 3);
    expect(matches[0]?.speciesId).toBe('red-cap');
    expect(matches[0]?.cosine).toBeGreaterThan(0.95);
    await db.close();
  });

  it('copia nel pacchetto solo le immagini usate', async () => {
    await expect(readFile(path.join(dir, 'out/images/red-cap.jpg'))).resolves.toBeDefined();
  });
});
