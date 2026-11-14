import { getRow, transaction, type SqlDb } from './db/sql';
import type { AssistantReply } from './types';

/** Stato esplicito e limitato della sessione: niente memoria autonoma. */
export interface SessionState {
  lastDomain?: 'botanical' | 'survival';
  /** Specie candidate dell'ultima risposta botanica: contesto per le domande successive. */
  lastSpeciesIds?: string[];
  /** Domanda rimasta in sospeso in attesa di un chiarimento dell'utente. */
  pendingQuestion?: string;
}

export interface UserMessage {
  role: 'user';
  text: string;
  /** Riferimento al file della foto nello storage privato dell'app. */
  imageRef?: string | null;
}

export interface AssistantMessage {
  role: 'assistant';
  reply: AssistantReply;
}

export type StoredMessage = (UserMessage | AssistantMessage) & { id: number; createdAt: string };

export interface ConversationInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** Cronologia locale delle conversazioni: visibile, gestibile e cancellabile dall'utente. */
export class ConversationStore {
  constructor(private readonly db: SqlDb) {}

  async create(id: string, title: string): Promise<ConversationInfo> {
    const now = new Date().toISOString();
    await this.db.run('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      id,
      title,
      now,
      now,
    ]);
    return { id, title, createdAt: now, updatedAt: now };
  }

  async list(): Promise<ConversationInfo[]> {
    const rows = await this.db.all<{ id: string; title: string; created_at: string; updated_at: string }>(
      'SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC',
    );
    return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  async exists(id: string): Promise<boolean> {
    return (await getRow(this.db, 'SELECT 1 FROM conversations WHERE id = ?', [id])) !== undefined;
  }

  async rename(id: string, title: string): Promise<void> {
    await this.db.run('UPDATE conversations SET title = ? WHERE id = ?', [title, id]);
  }

  async append(conversationId: string, message: UserMessage | AssistantMessage): Promise<StoredMessage> {
    const now = new Date().toISOString();
    const result = await this.db.run(
      'INSERT INTO messages (conversation_id, role, created_at, payload) VALUES (?, ?, ?, ?)',
      [conversationId, message.role, now, JSON.stringify(message)],
    );
    await this.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);
    return { ...message, id: result.lastInsertRowid, createdAt: now };
  }

  async messages(conversationId: string): Promise<StoredMessage[]> {
    const rows = await this.db.all<{ id: number; created_at: string; payload: string }>(
      'SELECT id, created_at, payload FROM messages WHERE conversation_id = ? ORDER BY id',
      [conversationId],
    );
    return rows.map((row) => ({
      ...(JSON.parse(row.payload) as UserMessage | AssistantMessage),
      id: row.id,
      createdAt: row.created_at,
    }));
  }

  async getState(conversationId: string): Promise<SessionState> {
    const row = await getRow<{ state: string }>(this.db, 'SELECT state FROM conversations WHERE id = ?', [
      conversationId,
    ]);
    return row ? (JSON.parse(row.state) as SessionState) : {};
  }

  async setState(conversationId: string, state: SessionState): Promise<void> {
    await this.db.run('UPDATE conversations SET state = ? WHERE id = ?', [JSON.stringify(state), conversationId]);
  }

  async delete(conversationId: string): Promise<void> {
    await transaction(this.db, async () => {
      await this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
      await this.db.run('DELETE FROM conversations WHERE id = ?', [conversationId]);
    });
  }

  async deleteAll(): Promise<void> {
    await transaction(this.db, async () => {
      await this.db.run('DELETE FROM messages');
      await this.db.run('DELETE FROM conversations');
    });
  }
}
