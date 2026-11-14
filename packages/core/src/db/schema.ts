import { getRow, transaction, type SqlDb } from './sql';

/**
 * Migrazioni in ordine: l'indice + 1 è la versione dello schema (PRAGMA user_version).
 * Lo stesso schema serve il database del pacchetto base e quello dell'utente.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    edition TEXT,
    lang TEXT,
    source TEXT,
    license TEXT,
    file_name TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER,
    reliability TEXT NOT NULL DEFAULT 'current',
    imported_at TEXT NOT NULL,
    index_status TEXT NOT NULL
  );

  CREATE TABLE chunks (
    id INTEGER PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    ord INTEGER NOT NULL,
    page INTEGER,
    section TEXT,
    text TEXT NOT NULL,
    embedding BLOB
  );
  CREATE INDEX chunks_document ON chunks(document_id);

  CREATE VIRTUAL TABLE chunks_fts USING fts5(
    text, content='chunks', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;

  CREATE TABLE species (
    id TEXT PRIMARY KEY,
    scientific_name TEXT NOT NULL,
    kind TEXT NOT NULL,
    family TEXT,
    toxicity TEXT NOT NULL,
    data TEXT NOT NULL,
    search_text TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE species_fts USING fts5(
    search_text, content='species', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER species_ai AFTER INSERT ON species BEGIN
    INSERT INTO species_fts(rowid, search_text) VALUES (new.rowid, new.search_text);
  END;
  CREATE TRIGGER species_ad AFTER DELETE ON species BEGIN
    INSERT INTO species_fts(species_fts, rowid, search_text) VALUES ('delete', old.rowid, old.search_text);
  END;

  CREATE TABLE species_images (
    id INTEGER PRIMARY KEY,
    species_id TEXT NOT NULL REFERENCES species(id),
    file TEXT NOT NULL,
    license TEXT NOT NULL,
    attribution TEXT NOT NULL,
    source_url TEXT NOT NULL,
    embedding BLOB
  );
  CREATE INDEX species_images_species ON species_images(species_id);

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX messages_conversation ON messages(conversation_id, id);

  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Porta il database all'ultima versione dello schema; idempotente. */
export async function migrate(db: SqlDb): Promise<void> {
  const row = await getRow<{ user_version: number }>(db, 'PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Schema ${current} più recente di quello supportato (${SCHEMA_VERSION})`);
  }
  for (let version = current; version < SCHEMA_VERSION; version++) {
    const sql = MIGRATIONS[version];
    if (!sql) continue;
    await transaction(db, async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

export async function getMeta(db: SqlDb, key: string): Promise<string | null> {
  const row = await getRow<{ value: string }>(db, 'SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: SqlDb, key: string, value: string): Promise<void> {
  await db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
    key,
    value,
  ]);
}
