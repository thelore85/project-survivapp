import { describe, expect, it } from 'vitest';
import {
  FakeTextEmbedder,
  LibraryStore,
  buildFtsQuery,
  chunkPages,
  getRow,
  hybridSearch,
  isRelevant,
  migrate,
  termCoverage,
} from '../src';
import { HISTORICAL_PAGES, WATER_PAGES, makeDb } from './helpers';

describe('schema', () => {
  it('la migrazione è idempotente e fissa la versione', async () => {
    const db = await makeDb();
    await migrate(db);
    const row = await getRow<{ user_version: number }>(db, 'PRAGMA user_version');
    expect(row?.user_version).toBe(1);
  });
});

describe('chunking', () => {
  it('conserva pagina e sezione di ogni chunk', () => {
    const chunks = chunkPages(WATER_PAGES);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ page: 12, section: 'WATER PURIFICATION' });
    expect(chunks[2]).toMatchObject({ page: 40, section: 'SHELTERS' });
  });

  it('divide i testi lunghi senza superare il limite e senza attraversare le pagine', () => {
    const sentence = 'This is a sentence about surviving in the wilderness with limited equipment. ';
    const chunks = chunkPages(
      [
        { page: 1, text: sentence.repeat(40) },
        { page: 2, text: sentence.repeat(3) },
      ],
      { maxChars: 500, overlapChars: 80 },
    );
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.text.length <= 500)).toBe(true);
    expect(chunks.filter((chunk) => chunk.page === 2)).toHaveLength(1);
  });

  it('taglia anche il testo OCR senza punteggiatura', () => {
    const chunks = chunkPages([{ page: 1, text: 'parola '.repeat(600) }], { maxChars: 400 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.text.length <= 400)).toBe(true);
  });
});

describe('ricerca testuale', () => {
  it('costruisce una query FTS sicura anche con caratteri speciali', () => {
    expect(buildFtsQuery('acqua "potabile" NEAR (fuoco)*')).toBe('"acqua" OR "potabile" OR "near" OR "fuoco"');
    expect(buildFtsQuery('il la di')).toBe('');
  });

  it('misura la copertura dei termini ignorando accenti e stopword', () => {
    expect(termCoverage('come purificare l’acqua', 'Purificare acqua piovana')).toBe(1);
    expect(termCoverage('fuoco e riparo', 'solo il fuoco')).toBe(0.5);
  });
});

describe('archivio documenti', () => {
  it('importa, indicizza e produce un report', async () => {
    const store = new LibraryStore('base', await makeDb());
    const report = await store.ingest({ id: 'doc', title: 'Manuale', sizeBytes: 1234 }, WATER_PAGES, new FakeTextEmbedder());
    expect(report).toMatchObject({ documentId: 'doc', pageCount: 3, chunkCount: 3, embedded: true });
    const [info] = await store.listDocuments();
    expect(info).toMatchObject({ title: 'Manuale', indexStatus: 'indexed', chunkCount: 3, sizeBytes: 1234 });
    expect(await store.totalSizeBytes()).toBe(1234);
  });

  it('trova il passaggio pertinente con full-text e con ricerca semantica', async () => {
    const embedder = new FakeTextEmbedder();
    const store = new LibraryStore('base', await makeDb());
    await store.ingest({ id: 'doc', title: 'Manuale' }, WATER_PAGES, embedder);

    const fts = await store.ftsSearch('boil water', 3);
    expect(fts[0]?.page).toBe(12);

    const { passages, semanticUsed } = await hybridSearch([store], embedder, 'how to build a shelter');
    expect(semanticUsed).toBe(true);
    expect(passages[0]).toMatchObject({ page: 40, documentTitle: 'Manuale' });
    expect(isRelevant(passages[0]!, 'how to build a shelter', embedder)).toBe(true);
  });

  it('senza embedder indicizza solo il testo e lo segnala', async () => {
    const store = new LibraryStore('user', await makeDb());
    const report = await store.ingest({ id: 'doc', title: 'Manuale' }, WATER_PAGES, null);
    expect(report.embedded).toBe(false);
    expect((await store.listDocuments())[0]?.indexStatus).toBe('indexed_text_only');
    const { passages, semanticUsed } = await hybridSearch([store], null, 'fire tinder');
    expect(semanticUsed).toBe(false);
    expect(passages[0]?.page).toBe(13);
  });

  it('esclude i documenti storici quando richiesto', async () => {
    const embedder = new FakeTextEmbedder();
    const store = new LibraryStore('base', await makeDb());
    await store.ingest({ id: 'old', title: 'Old', reliability: 'historical' }, HISTORICAL_PAGES, embedder);
    expect((await hybridSearch([store], embedder, 'edible mushroom')).passages).toHaveLength(1);
    expect((await hybridSearch([store], embedder, 'edible mushroom', { excludeHistorical: true })).passages).toHaveLength(0);
  });

  it('la rimozione toglie documento, chunk e voci di ricerca', async () => {
    const embedder = new FakeTextEmbedder();
    const store = new LibraryStore('user', await makeDb());
    await store.ingest({ id: 'doc', title: 'Manuale' }, WATER_PAGES, embedder);
    expect(await store.remove('doc')).toBe(true);
    expect(await store.listDocuments()).toHaveLength(0);
    expect((await hybridSearch([store], embedder, 'boil water')).passages).toHaveLength(0);
    expect(await store.remove('doc')).toBe(false);
  });

  it('ricostruisce gli embedding mancanti', async () => {
    const embedder = new FakeTextEmbedder();
    const store = new LibraryStore('user', await makeDb());
    await store.ingest({ id: 'doc', title: 'Manuale' }, WATER_PAGES, null);
    expect(await store.rebuildEmbeddings(embedder)).toBe(3);
    expect((await store.listDocuments())[0]?.indexStatus).toBe('indexed');
    expect((await hybridSearch([store], embedder, 'shelter ridge pole')).semanticUsed).toBe(true);
  });

  it('un documento senza testo viene rifiutato', async () => {
    const store = new LibraryStore('user', await makeDb());
    await expect(store.ingest({ id: 'doc', title: 'Vuoto' }, [{ page: 1, text: '   ' }], null)).rejects.toThrow(
      'empty_document',
    );
  });
});
