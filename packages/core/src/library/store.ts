import { getMeta, setMeta } from '../db/schema';
import { blobToVector, getRow, transaction, vectorToBlob, type SqlDb } from '../db/sql';
import { dot, type TextEmbedder } from '../runtime/types';
import { buildFtsQuery, termCoverage } from '../text/tokens';
import type { Passage, Reliability } from '../types';
import { chunkPages, type PageText } from './chunking';

export interface DocumentInput {
  id: string;
  title: string;
  author?: string | null;
  edition?: string | null;
  lang?: string | null;
  source?: string | null;
  license?: string | null;
  fileName?: string | null;
  sizeBytes?: number;
  reliability?: Reliability;
}

export interface DocumentInfo {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  lang: string | null;
  source: string | null;
  license: string | null;
  fileName: string | null;
  sizeBytes: number;
  pageCount: number | null;
  reliability: Reliability;
  importedAt: string;
  indexStatus: 'indexed' | 'indexed_text_only' | 'failed';
  chunkCount: number;
}

export interface IngestReport {
  documentId: string;
  pageCount: number;
  chunkCount: number;
  embedded: boolean;
  emptyPages: number;
  warnings: string[];
}

export interface SearchFilter {
  /** Esclude i documenti storici: usato quando la domanda riguarda ingestione o commestibilità. */
  excludeHistorical?: boolean;
}

interface ChunkRow {
  id: number;
  document_id: string;
  title: string;
  reliability: Reliability;
  page: number | null;
  section: string | null;
  text: string;
}

const EMBEDDING_MODEL_KEY = 'text_embedding_model';
const CHUNK_SELECT =
  'SELECT c.id, c.document_id, d.title, d.reliability, c.page, c.section, c.text ' +
  'FROM chunks c JOIN documents d ON d.id = c.document_id';

/** Documenti indicizzati di un database (pacchetto base o file utente): pattern Repository. */
export class LibraryStore {
  private vectors: { ids: number[]; matrix: Float32Array[] } | null = null;

  constructor(
    readonly name: string,
    private readonly db: SqlDb,
  ) {}

  /** Importa un documento: chunk, indice full-text ed embedding, con report finale. */
  async ingest(doc: DocumentInput, pages: PageText[], embedder: TextEmbedder | null): Promise<IngestReport> {
    const warnings: string[] = [];
    const chunks = chunkPages(pages);
    const emptyPages = pages.filter((page) => page.text.trim().length === 0).length;
    if (chunks.length === 0) {
      throw new Error('empty_document');
    }
    if (emptyPages > 0) warnings.push(`${emptyPages} pagine senza testo estraibile`);

    let embeddings: Float32Array[] | null = null;
    if (embedder) {
      const storeModel = await getMeta(this.db, EMBEDDING_MODEL_KEY);
      if (storeModel && storeModel !== embedder.id) {
        warnings.push(`embedding saltati: l'archivio usa ${storeModel}, il modello attivo è ${embedder.id}`);
      } else {
        embeddings = [];
        for (let start = 0; start < chunks.length; start += 32) {
          const batch = chunks.slice(start, start + 32).map((chunk) => chunk.text);
          embeddings.push(...(await embedder.embed(batch, 'document')));
        }
        if (!storeModel) await setMeta(this.db, EMBEDDING_MODEL_KEY, embedder.id);
      }
    } else {
      warnings.push('embedding saltati: nessun modello di embedding disponibile');
    }

    await transaction(this.db, async () => {
      await this.deleteRows(doc.id);
      await this.db.run(
        'INSERT INTO documents (id, title, author, edition, lang, source, license, file_name, size_bytes, ' +
          'page_count, reliability, imported_at, index_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          doc.id,
          doc.title,
          doc.author ?? null,
          doc.edition ?? null,
          doc.lang ?? null,
          doc.source ?? null,
          doc.license ?? null,
          doc.fileName ?? null,
          doc.sizeBytes ?? 0,
          pages.length,
          doc.reliability ?? 'current',
          new Date().toISOString(),
          embeddings ? 'indexed' : 'indexed_text_only',
        ],
      );
      for (const [index, chunk] of chunks.entries()) {
        const embedding = embeddings?.[index];
        await this.db.run(
          'INSERT INTO chunks (document_id, ord, page, section, text, embedding) VALUES (?, ?, ?, ?, ?, ?)',
          [doc.id, chunk.ord, chunk.page, chunk.section, chunk.text, embedding ? vectorToBlob(embedding) : null],
        );
      }
    });
    this.vectors = null;

    return {
      documentId: doc.id,
      pageCount: pages.length,
      chunkCount: chunks.length,
      embedded: embeddings !== null,
      emptyPages,
      warnings,
    };
  }

  async remove(documentId: string): Promise<boolean> {
    const removed = await transaction(this.db, () => this.deleteRows(documentId));
    this.vectors = null;
    return removed;
  }

  private async deleteRows(documentId: string): Promise<boolean> {
    await this.db.run('DELETE FROM chunks WHERE document_id = ?', [documentId]);
    const result = await this.db.run('DELETE FROM documents WHERE id = ?', [documentId]);
    return result.changes > 0;
  }

  async listDocuments(): Promise<DocumentInfo[]> {
    const rows = await this.db.all<{
      id: string;
      title: string;
      author: string | null;
      edition: string | null;
      lang: string | null;
      source: string | null;
      license: string | null;
      file_name: string | null;
      size_bytes: number;
      page_count: number | null;
      reliability: Reliability;
      imported_at: string;
      index_status: DocumentInfo['indexStatus'];
      chunk_count: number;
    }>(
      'SELECT d.*, (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) AS chunk_count ' +
        'FROM documents d ORDER BY d.title',
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      edition: row.edition,
      lang: row.lang,
      source: row.source,
      license: row.license,
      fileName: row.file_name,
      sizeBytes: row.size_bytes,
      pageCount: row.page_count,
      reliability: row.reliability,
      importedAt: row.imported_at,
      indexStatus: row.index_status,
      chunkCount: row.chunk_count,
    }));
  }

  async totalSizeBytes(): Promise<number> {
    const row = await getRow<{ total: number | null }>(this.db, 'SELECT SUM(size_bytes) AS total FROM documents');
    return row?.total ?? 0;
  }

  /** Ricalcola gli embedding di tutti i chunk: serve quando cambia il modello o l'indice va ricostruito. */
  async rebuildEmbeddings(embedder: TextEmbedder): Promise<number> {
    const rows = await this.db.all<{ id: number; text: string }>('SELECT id, text FROM chunks ORDER BY id');
    for (let start = 0; start < rows.length; start += 32) {
      const batch = rows.slice(start, start + 32);
      const vectors = await embedder.embed(
        batch.map((row) => row.text),
        'document',
      );
      await transaction(this.db, async () => {
        for (const [index, row] of batch.entries()) {
          const vector = vectors[index];
          if (vector) await this.db.run('UPDATE chunks SET embedding = ? WHERE id = ?', [vectorToBlob(vector), row.id]);
        }
      });
    }
    await setMeta(this.db, EMBEDDING_MODEL_KEY, embedder.id);
    await this.db.run("UPDATE documents SET index_status = 'indexed'");
    this.vectors = null;
    return rows.length;
  }

  async embeddingModel(): Promise<string | null> {
    return getMeta(this.db, EMBEDDING_MODEL_KEY);
  }

  private filterSql(filter: SearchFilter): string {
    return filter.excludeHistorical ? " AND d.reliability <> 'historical'" : '';
  }

  private toPassage(row: ChunkRow, query: string, cosine: number | null): Passage {
    return {
      store: this.name,
      chunkId: row.id,
      documentId: row.document_id,
      documentTitle: row.title,
      reliability: row.reliability,
      page: row.page,
      section: row.section,
      text: row.text,
      cosine,
      termCoverage: termCoverage(query, row.text),
      score: 0,
    };
  }

  /** Ricerca per parole (FTS5, ordinata con BM25). */
  async ftsSearch(query: string, limit: number, filter: SearchFilter = {}): Promise<Passage[]> {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];
    const rows = await this.db.all<ChunkRow>(
      `${CHUNK_SELECT} JOIN chunks_fts f ON f.rowid = c.id ` +
        `WHERE chunks_fts MATCH ?${this.filterSql(filter)} ORDER BY bm25(chunks_fts) LIMIT ?`,
      [ftsQuery, limit],
    );
    return rows.map((row) => this.toPassage(row, query, null));
  }

  /**
   * Ricerca semantica a forza bruta sui vettori in memoria.
   * Con qualche migliaio di chunk basta e non richiede estensioni native di SQLite.
   */
  async vectorSearch(
    query: string,
    queryVector: Float32Array,
    limit: number,
    filter: SearchFilter = {},
  ): Promise<Passage[]> {
    const vectors = await this.loadVectors();
    const scored: { id: number; cosine: number }[] = [];
    for (const [index, vector] of vectors.matrix.entries()) {
      const id = vectors.ids[index];
      if (id !== undefined) scored.push({ id, cosine: dot(queryVector, vector) });
    }
    scored.sort((a, b) => b.cosine - a.cosine);

    const passages: Passage[] = [];
    // Margine sul limite: il filtro può scartare risultati dopo l'ordinamento.
    for (const item of scored.slice(0, limit * 4)) {
      const row = await getRow<ChunkRow>(this.db, `${CHUNK_SELECT} WHERE c.id = ?${this.filterSql(filter)}`, [item.id]);
      if (row) passages.push(this.toPassage(row, query, item.cosine));
      if (passages.length >= limit) break;
    }
    return passages;
  }

  private async loadVectors(): Promise<{ ids: number[]; matrix: Float32Array[] }> {
    if (!this.vectors) {
      const rows = await this.db.all<{ id: number; embedding: Uint8Array }>(
        'SELECT id, embedding FROM chunks WHERE embedding IS NOT NULL ORDER BY id',
      );
      this.vectors = { ids: rows.map((row) => row.id), matrix: rows.map((row) => blobToVector(row.embedding)) };
    }
    return this.vectors;
  }
}
