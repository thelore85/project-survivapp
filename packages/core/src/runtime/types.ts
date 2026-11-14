import type { RgbaImage } from '../types';

/** Un modello che occupa memoria: si carica su richiesta e si rilascia in modo esplicito. */
export interface ManagedModel {
  readonly id: string;
  load(): Promise<void>;
  unload(): Promise<void>;
  isLoaded(): boolean;
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

/**
 * Porte verso i modelli (pattern Strategy): i domini dipendono da queste interfacce,
 * così un modello si sostituisce senza toccare botanica, survival o orchestratore.
 */
export interface LlmRuntime extends ManagedModel {
  generate(request: LlmRequest, onToken?: (token: string) => void): Promise<string>;
}

export interface TextEmbedder extends ManagedModel {
  readonly dim: number;
  /** Coseno minimo perché un passaggio conti come pertinente: dipende dal modello. */
  readonly relevanceThreshold: number;
  embed(texts: string[], kind: 'query' | 'document'): Promise<Float32Array[]>;
}

export interface VisionEmbedder extends ManagedModel {
  readonly dim: number;
  /** Coseno minimo perché un'immagine del catalogo conti come candidata. */
  readonly relevanceThreshold: number;
  embedImage(image: RgbaImage): Promise<Float32Array>;
}

export function l2normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  for (let i = 0; i < vector.length; i++) vector[i] = (vector[i] ?? 0) / norm;
  return vector;
}

/** Prodotto scalare: coincide col coseno perché salviamo solo vettori normalizzati. */
export function dot(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}
