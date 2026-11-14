import { normalizePackageConfig, type PackageConfig } from './config';

export interface ModelEntry {
  /** Identificativo del modello: deve coincidere con quello usato per calcolare gli embedding. */
  id: string;
  /** File dei pesi dentro la cartella `models/` del pacchetto; null se il modello non è incluso. */
  file: string | null;
  sizeMb?: number;
}

/** Contenuto di `manifest.json`, il file che descrive un pacchetto base. */
export interface PackageManifest {
  formatVersion: 1;
  id: string;
  version: string;
  createdAt: string;
  config: PackageConfig;
  models: {
    llm: ModelEntry | null;
    textEmbedder: ModelEntry | null;
    vision: ModelEntry | null;
  };
  content: { database: string; imagesDir: string };
  stats: { species: number; documents: number; chunks: number };
}

export const PACKAGE_FORMAT_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModel(value: unknown, name: string): ModelEntry | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) throw new Error(`manifest: modello ${name} non valido`);
  return {
    id: value.id,
    file: typeof value.file === 'string' ? value.file : null,
    ...(typeof value.sizeMb === 'number' ? { sizeMb: value.sizeMb } : {}),
  };
}

/** Valida un manifest letto da file: rifiuta formati sconosciuti invece di indovinare. */
export function parseManifest(raw: unknown): PackageManifest {
  if (!isRecord(raw)) throw new Error('manifest: non è un oggetto');
  if (raw.formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new Error(`manifest: formato ${String(raw.formatVersion)} non supportato (atteso ${PACKAGE_FORMAT_VERSION})`);
  }
  for (const key of ['id', 'version', 'createdAt'] as const) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw new Error(`manifest: campo ${key} mancante`);
  }
  const content = raw.content;
  if (!isRecord(content) || typeof content.database !== 'string' || typeof content.imagesDir !== 'string') {
    throw new Error('manifest: sezione content non valida');
  }
  const models = isRecord(raw.models) ? raw.models : {};
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const count = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    formatVersion: 1,
    id: raw.id as string,
    version: raw.version as string,
    createdAt: raw.createdAt as string,
    config: normalizePackageConfig(isRecord(raw.config) ? (raw.config as Partial<PackageConfig>) : null),
    models: {
      llm: parseModel(models.llm, 'llm'),
      textEmbedder: parseModel(models.textEmbedder, 'textEmbedder'),
      vision: parseModel(models.vision, 'vision'),
    },
    content: { database: content.database, imagesDir: content.imagesDir },
    stats: { species: count(stats.species), documents: count(stats.documents), chunks: count(stats.chunks) },
  };
}
