import {
  FakeLlm,
  FakeTextEmbedder,
  FakeVisionEmbedder,
  migrate,
  parseManifest,
  plainTextExtractor,
  type PackageManifest,
  type PageText,
  type RunResult,
  type SqlDb,
  type SqlValue,
  type TextExtractor,
} from '@survivapp/core';
import type { Platform } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- le librerie caricate a runtime non hanno tipi nel bundle */

const PACKAGE_URL = '/demo-package';

/** Import nativo del browser: tiene SQLite e pdf.js fuori dal bundle di Metro. */
const importUrl = new Function('url', 'return import(url)') as (url: string) => Promise<any>;

class WasmSqlDb implements SqlDb {
  constructor(
    private readonly sqlite3: any,
    private readonly db: any,
    private readonly onWrite?: () => void,
  ) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
    this.onWrite?.();
  }

  async run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
    this.db.exec({ sql, bind: params.length ? params : undefined });
    this.onWrite?.();
    return {
      lastInsertRowid: Number(this.sqlite3.capi.sqlite3_last_insert_rowid(this.db.pointer)),
      changes: this.db.changes(),
    };
  }

  async all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.exec({ sql, bind: params.length ? params : undefined, rowMode: 'object', returnValue: 'resultRows' });
  }

  async close(): Promise<void> {
    this.db.close();
  }

  export(): Uint8Array {
    return this.sqlite3.capi.sqlite3_js_db_export(this.db.pointer);
  }
}

function openFromBytes(sqlite3: any, bytes: Uint8Array | null, readOnly: boolean): any {
  const db = new sqlite3.oo1.DB(':memory:');
  if (bytes && bytes.byteLength > 0) {
    const pointer = sqlite3.wasm.allocFromTypedArray(bytes);
    const flags =
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      (readOnly ? sqlite3.capi.SQLITE_DESERIALIZE_READONLY : sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE);
    const code = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', pointer, bytes.byteLength, bytes.byteLength, flags);
    if (code !== 0) throw new Error(`sqlite3_deserialize: ${code}`);
  }
  return db;
}

const IDB_NAME = 'survivapp';
const IDB_STORE = 'files';
const USER_DB_KEY = 'user.db';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, 'readwrite');
    transaction.objectStore(IDB_STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

const pdfExtractor: TextExtractor = {
  async extract(bytes: Uint8Array): Promise<PageText[]> {
    const pdfjs = await importUrl('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: bytes });
    const pdf = await task.promise;
    const pages: PageText[] = [];
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        let text = '';
        for (const item of content.items) {
          if (typeof item.str === 'string') text += item.str + (item.hasEOL ? '\n' : ' ');
        }
        pages.push({ page: number, text: text.trim() });
      }
    } finally {
      await task.destroy();
    }
    return pages;
  },
};

/** Piattaforma browser: pacchetto demo servito dal server di sviluppo, modelli finti, dati in IndexedDB. */
export async function initPlatform(): Promise<Platform> {
  const warnings: string[] = [];
  const sqlite3InitModule = (await importUrl('/vendor/sqlite/index.mjs')).default;
  const sqlite3 = await sqlite3InitModule();

  let manifest: PackageManifest | null = null;
  let content: SqlDb | null = null;
  try {
    const response = await fetch(`${PACKAGE_URL}/manifest.json`);
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    manifest = parseManifest(await response.json());
    const database = await fetch(`${PACKAGE_URL}/${manifest.content.database}`);
    if (!database.ok) throw new Error(`database ${database.status}`);
    content = new WasmSqlDb(sqlite3, openFromBytes(sqlite3, new Uint8Array(await database.arrayBuffer()), true));
  } catch (error) {
    manifest = null;
    warnings.push(`package_missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Il database utente vive in memoria e viene salvato in IndexedDB poco dopo ogni scrittura.
  let saved: Uint8Array | null = null;
  try {
    saved = await idbGet(USER_DB_KEY);
  } catch {
    warnings.push('storage_unavailable');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const user: WasmSqlDb = new WasmSqlDb(sqlite3, openFromBytes(sqlite3, saved, false), () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      idbPut(USER_DB_KEY, user.export()).catch(() => undefined);
    }, 400);
  });
  await migrate(user);

  const imagesDir = manifest?.content.imagesDir ?? 'images';
  return {
    demo: true,
    content,
    user,
    manifest,
    models: { llm: new FakeLlm(), textEmbedder: new FakeTextEmbedder(), vision: new FakeVisionEmbedder() },
    extractors: { txt: plainTextExtractor, md: plainTextExtractor, pdf: pdfExtractor },
    imageUri: (file) => `${PACKAGE_URL}/${file.startsWith(`${imagesDir}/`) ? file : `${imagesDir}/${file}`}`,
    async capabilities() {
      const memoryGb = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const free = estimate?.quota && estimate.usage !== undefined ? (estimate.quota - estimate.usage) / 1024 / 1024 : 0;
      return { totalRamMb: memoryGb * 1024, freeStorageMb: Math.round(free), runtimeSupported: true, accelerators: [] };
    },
    warnings,
  };
}
