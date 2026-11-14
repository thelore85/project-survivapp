export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

/**
 * Porta verso SQLite (pattern Adapter): il core non sa se sotto c'è Node, WebAssembly o expo-sqlite.
 */
export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<RunResult>;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function getRow<T = Record<string, SqlValue>>(
  db: SqlDb,
  sql: string,
  params?: SqlValue[],
): Promise<T | undefined> {
  const rows = await db.all<T>(sql, params);
  return rows[0];
}

/** Esegue `fn` in una transazione; rollback se lancia. */
export async function transaction<T>(db: SqlDb, fn: () => Promise<T>): Promise<T> {
  await db.exec('BEGIN');
  try {
    const result = await fn();
    await db.exec('COMMIT');
    return result;
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength));
}

export function blobToVector(blob: Uint8Array): Float32Array {
  // Copia: il blob può non essere allineato a 4 byte dentro il buffer dell'adapter.
  const copy = new Uint8Array(blob.byteLength);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}
