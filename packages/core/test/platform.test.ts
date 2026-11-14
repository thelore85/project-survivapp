import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PACKAGE_CONFIG,
  FakeLlm,
  FakeTextEmbedder,
  FakeVisionEmbedder,
  ImportError,
  LibraryStore,
  ModelManager,
  SettingsStore,
  UserFiles,
  hybridSearch,
  normalizePackageConfig,
  parseManifest,
  plainTextExtractor,
  resolveConfig,
  selectProfile,
  type TextExtractor,
} from '../src';
import { makeDb } from './helpers';

const MB = 1024 * 1024;
const TEXT = 'Snow shelters keep the heat inside. Dig the entrance lower than the sleeping platform to trap warm air. '.repeat(3);

const fakePdfExtractor: TextExtractor = {
  async extract() {
    return [{ page: 1, text: TEXT }];
  },
};

async function setupFiles() {
  const db = await makeDb();
  const store = new LibraryStore('user', db);
  const files = new UserFiles(store, { txt: plainTextExtractor, md: plainTextExtractor, pdf: fakePdfExtractor });
  const config = resolveConfig(DEFAULT_PACKAGE_CONFIG, {});
  return { db, store, files, config, embedder: new FakeTextEmbedder() };
}

describe('configurazione a livelli', () => {
  it('usa i default del pacchetto quando l’utente non ha scelto nulla', () => {
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, {})).toMatchObject({ language: 'it', userQuotaMb: 200, maxUserFileMb: 100 });
  });

  it('le scelte dell’utente sovrascrivono i default entro i limiti del pacchetto', () => {
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, { language: 'es', userQuotaMb: 500 })).toMatchObject({
      language: 'es',
      userQuotaMb: 500,
    });
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, { userQuotaMb: 5 }).userQuotaMb).toBe(50);
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, { userQuotaMb: 999999 }).userQuotaMb).toBe(2000);
  });

  it('una configurazione di pacchetto incompleta o sbagliata ricade sui default', () => {
    const config = normalizePackageConfig({ maxUserFileMb: -1, defaultUserQuotaMb: 300, allowedUserFormats: ['pdf', 'exe'] });
    expect(config).toMatchObject({ maxUserFileMb: 100, defaultUserQuotaMb: 300, allowedUserFormats: ['pdf'] });
  });

  it('la quota modificata resta valida al riavvio', async () => {
    const db = await makeDb();
    await new SettingsStore(db).save({ userQuotaMb: 350, language: 'en' });
    const reloaded = await new SettingsStore(db).load();
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, reloaded)).toMatchObject({ userQuotaMb: 350, language: 'en' });
  });

  it('il tema scelto resta al riavvio e parte da quello di sistema', async () => {
    const db = await makeDb();
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, await new SettingsStore(db).load()).theme).toBe('system');
    await new SettingsStore(db).save({ theme: 'light' });
    expect(resolveConfig(DEFAULT_PACKAGE_CONFIG, await new SettingsStore(db).load()).theme).toBe('light');
  });

  it('ignora chiavi sconosciute salvate nel database', async () => {
    const db = await makeDb();
    await db.run("INSERT INTO settings (key, value) VALUES ('allowEdibilityAnswers', 'true')");
    expect(await new SettingsStore(db).load()).toEqual({});
  });
});

describe('file dell’utente', () => {
  it('importa un file di testo e lo rende ricercabile', async () => {
    const { files, store, config, embedder } = await setupFiles();
    const report = await files.import({ name: 'Appunti neve.txt', bytes: new TextEncoder().encode(TEXT) }, config, 'it', embedder);
    expect(report.chunkCount).toBeGreaterThan(0);
    expect((await files.list())[0]).toMatchObject({ title: 'Appunti neve', fileName: 'Appunti neve.txt' });
    expect((await hybridSearch([store], embedder, 'snow shelter entrance')).passages.length).toBeGreaterThan(0);
  });

  it('rifiuta un formato non ammesso con un messaggio esplicito', async () => {
    const { files, config } = await setupFiles();
    const attempt = files.import({ name: 'foto.jpg', bytes: new Uint8Array(10) }, config, 'it', null);
    await expect(attempt).rejects.toMatchObject({ code: 'format_not_allowed' });
    await expect(attempt).rejects.toThrow('solo PDF e file di testo');
  });

  it('rifiuta un file oltre il limite per file', async () => {
    const { files, config } = await setupFiles();
    await expect(files.check('manuale.pdf', 100 * MB + 1, config, 'en')).rejects.toThrow('limit is 100 MB');
    await expect(files.check('manuale.pdf', 100 * MB, config, 'en')).resolves.toBeUndefined();
  });

  it('rifiuta un file che supera la quota totale', async () => {
    const { files, config, embedder } = await setupFiles();
    const small = resolveConfig({ ...config, minUserQuotaMb: 1 }, { userQuotaMb: 1 });
    await files.import({ name: 'a.pdf', bytes: new Uint8Array(0.7 * MB) }, small, 'it', embedder);
    const attempt = files.import({ name: 'b.pdf', bytes: new Uint8Array(0.7 * MB) }, small, 'it', embedder);
    await expect(attempt).rejects.toBeInstanceOf(ImportError);
    await expect(attempt).rejects.toMatchObject({ code: 'quota_exceeded' });
    expect(await files.list()).toHaveLength(1);
  });

  it('nessun limite sul numero di file', async () => {
    const { files, config, embedder } = await setupFiles();
    for (let i = 0; i < 12; i++) {
      await files.import({ name: `nota-${i}.txt`, bytes: new TextEncoder().encode(TEXT) }, config, 'it', embedder);
    }
    expect(await files.list()).toHaveLength(12);
  });

  it('la rimozione libera lo spazio', async () => {
    const { files, config, embedder } = await setupFiles();
    const report = await files.import({ name: 'a.txt', bytes: new TextEncoder().encode(TEXT) }, config, 'it', embedder);
    expect(await files.usedBytes()).toBeGreaterThan(0);
    await files.remove(report.documentId);
    expect(await files.usedBytes()).toBe(0);
  });

  it('segnala un file senza testo e un file illeggibile', async () => {
    const { store, config } = await setupFiles();
    const broken: TextExtractor = {
      async extract() {
        throw new Error('corrupt');
      },
    };
    const files = new UserFiles(store, { txt: plainTextExtractor, pdf: broken });
    await expect(files.import({ name: 'vuoto.txt', bytes: new Uint8Array(0) }, config, 'it', null)).rejects.toMatchObject({
      code: 'empty_document',
    });
    await expect(files.import({ name: 'rotto.pdf', bytes: new Uint8Array(5) }, config, 'it', null)).rejects.toMatchObject({
      code: 'extraction_failed',
    });
  });
});

describe('gestione dei modelli', () => {
  it('carica su richiesta e rilascia il modello usato meno di recente', async () => {
    const llm = new FakeLlm();
    const embedder = new FakeTextEmbedder();
    const vision = new FakeVisionEmbedder();
    const manager = new ModelManager({ llm, textEmbedder: embedder, vision }, 2);

    expect(manager.status().every((status) => !status.loaded)).toBe(true);
    await manager.llm();
    await manager.textEmbedder();
    expect([llm.isLoaded(), embedder.isLoaded(), vision.isLoaded()]).toEqual([true, true, false]);

    await manager.vision();
    expect([llm.isLoaded(), embedder.isLoaded(), vision.isLoaded()]).toEqual([false, true, true]);
  });

  it('se la memoria non basta rilascia gli altri e riprova; se fallisce ancora disabilita la funzione', async () => {
    const llm = new FakeLlm();
    const embedder = new FakeTextEmbedder();
    const manager = new ModelManager({ llm, textEmbedder: embedder }, 3);
    await manager.textEmbedder();

    let attempts = 0;
    const originalLoad = llm.load.bind(llm);
    llm.load = async () => {
      attempts++;
      if (embedder.isLoaded()) throw new Error('out of memory');
      await originalLoad();
    };
    expect(await manager.llm()).toBe(llm);
    expect(attempts).toBe(2);
    expect(embedder.isLoaded()).toBe(false);

    await manager.release('llm');
    llm.load = async () => {
      throw new Error('out of memory');
    };
    expect(await manager.llm()).toBeNull();
    expect(manager.status().find((status) => status.role === 'llm')).toMatchObject({ available: false, error: 'out of memory' });
  });

  it('sceglie il profilo in base alle risorse', () => {
    const base = { freeStorageMb: 50000, runtimeSupported: true, accelerators: [] };
    expect(selectProfile({ ...base, totalRamMb: 16000 }).id).toBe('full');
    expect(selectProfile({ ...base, totalRamMb: 8000 }).maxLoadedModels).toBe(2);
    expect(selectProfile({ ...base, totalRamMb: 6000 }).id).toBe('minimal');
    expect(selectProfile({ ...base, totalRamMb: 3000 }).disabled).toContain('generation');
    expect(selectProfile({ ...base, totalRamMb: 16000, runtimeSupported: false }).id).toBe('retrieval_only');
    expect(selectProfile({ ...base, totalRamMb: 16000, freeStorageMb: 100 }, 4000).reasons).toEqual(['storage_insufficient']);
  });
});

describe('manifest del pacchetto', () => {
  const valid = {
    formatVersion: 1,
    id: 'demo',
    version: '0.1.0',
    createdAt: '2026-11-14T00:00:00Z',
    config: { defaultUserQuotaMb: 300 },
    models: { llm: null, textEmbedder: { id: 'fake-hash-256', file: null }, vision: { id: 'fake-colour-120' } },
    content: { database: 'content.db', imagesDir: 'images' },
    stats: { species: 3, documents: 2, chunks: 10 },
  };

  it('legge un manifest valido e completa la configurazione', () => {
    const manifest = parseManifest(valid);
    expect(manifest.config).toMatchObject({ defaultUserQuotaMb: 300, maxUserFileMb: 100 });
    expect(manifest.models.vision).toEqual({ id: 'fake-colour-120', file: null });
    expect(manifest.models.llm).toBeNull();
  });

  it('rifiuta formati sconosciuti e manifest incompleti', () => {
    expect(() => parseManifest({ ...valid, formatVersion: 2 })).toThrow('non supportato');
    expect(() => parseManifest({ ...valid, content: {} })).toThrow('content');
    expect(() => parseManifest({ ...valid, id: '' })).toThrow('id');
    expect(() => parseManifest(null)).toThrow();
  });
});
