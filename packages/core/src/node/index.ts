import { DatabaseSync } from 'node:sqlite';
import type { RunResult, SqlDb, SqlValue } from '../db/sql';

/** Adapter SqlDb su node:sqlite: usato dai test e dal costruttore di pacchetti, mai dall'app. */
export class NodeSqlDb implements SqlDb {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
    const result = this.db.prepare(sql).run(...params);
    return { lastInsertRowid: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
