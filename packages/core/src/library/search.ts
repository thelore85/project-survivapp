import type { TextEmbedder } from '../runtime/types';
import { contentTokens, termCoverage } from '../text/tokens';
import type { Passage } from '../types';
import type { LibraryStore, SearchFilter } from './store';

export interface HybridSearchOptions extends SearchFilter {
  limit?: number;
}

export interface HybridSearchResult {
  passages: Passage[];
  /** False se nessun archivio ha embedding compatibili col modello attivo. */
  semanticUsed: boolean;
}

const RRF_K = 60;

/**
 * Ricerca ibrida: full-text e semantica su tutti gli archivi, fuse con Reciprocal Rank Fusion.
 * RRF usa le posizioni e non i punteggi, quindi può unire BM25 e coseno che hanno scale diverse.
 */
export async function hybridSearch(
  stores: LibraryStore[],
  embedder: TextEmbedder | null,
  query: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const limit = options.limit ?? 6;
  const pool = limit * 3;
  const wordQuery = embedder?.rewriteQuery?.(query) ?? query;
  const merged = new Map<string, Passage>();
  let semanticUsed = false;
  let queryVector: Float32Array | null = null;

  const add = (passages: Passage[]): void => {
    for (const [rank, passage] of passages.entries()) {
      const key = `${passage.store}:${passage.chunkId}`;
      const existing = merged.get(key);
      const gain = 1 / (RRF_K + rank + 1);
      if (existing) {
        existing.score += gain;
        existing.cosine ??= passage.cosine;
      } else {
        merged.set(key, { ...passage, score: gain });
      }
    }
  };

  for (const store of stores) {
    add(await store.ftsSearch(wordQuery, pool, options));
    if (embedder && (await store.embeddingModel()) === embedder.id) {
      queryVector ??= (await embedder.embed([query], 'query'))[0] ?? null;
      if (queryVector) {
        add(await store.vectorSearch(wordQuery, queryVector, pool, options));
        semanticUsed = true;
      }
    }
  }

  const passages = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  return { passages, semanticUsed };
}

/**
 * Un passaggio è pertinente se è vicino alla domanda per significato (coseno sopra la soglia
 * del modello) o per parole (copre abbastanza termini della domanda).
 */
export function isRelevant(passage: Passage, query: string, embedder: TextEmbedder | null): boolean {
  if (embedder && passage.cosine !== null && passage.cosine >= embedder.relevanceThreshold) return true;
  const wordQuery = embedder?.rewriteQuery?.(query) ?? query;
  const terms = new Set(contentTokens(wordQuery)).size;
  if (terms === 0) return false;
  // Ricalcolata sulla domanda: la ricerca può aver usato un testo più ampio (domanda + contesto).
  const coverage = termCoverage(wordQuery, passage.text);
  const matched = Math.round(coverage * terms);
  return terms <= 2 ? matched === terms : matched >= 2 && coverage >= 0.5;
}
