import { getMeta, setMeta } from '../db/schema';
import { blobToVector, getRow, transaction, vectorToBlob, type SqlDb } from '../db/sql';
import { dot, type VisionEmbedder } from '../runtime/types';
import { buildFtsQuery, normalizeText } from '../text/tokens';
import type { Lang, RgbaImage, SpeciesImage, SpeciesRecord, SpeciesSummary } from '../types';

const VISION_MODEL_KEY = 'vision_embedding_model';

export interface ImageMatch {
  speciesId: string;
  cosine: number;
}

function searchText(record: SpeciesRecord): string {
  return [
    record.scientificName,
    ...Object.values(record.commonNames).flat(),
    record.taxonomy.family ?? '',
    record.taxonomy.genus ?? '',
    ...Object.values(record.descriptions),
  ].join(' \n');
}

/** Sintesi di una scheda nella lingua richiesta, con ripiego sull'inglese. */
export function summarize(record: SpeciesRecord, lang: Lang): SpeciesSummary {
  return {
    id: record.id,
    scientificName: record.scientificName,
    commonName: record.commonNames[lang]?.[0] ?? record.commonNames.en?.[0] ?? null,
    kind: record.kind,
    family: record.taxonomy.family ?? null,
    toxicity: record.toxicity.level,
    toxicityNote: record.toxicity.note?.[lang] ?? record.toxicity.note?.en ?? null,
    image: record.images[0] ?? null,
  };
}

/** Catalogo botanico locale del pacchetto base: pattern Repository. */
export class Catalogue {
  private imageVectors: { speciesIds: string[]; matrix: Float32Array[] } | null = null;

  constructor(private readonly db: SqlDb) {}

  /** Usato dal costruttore di pacchetti: l'app non scrive mai nel catalogo. */
  async insert(record: SpeciesRecord, imageEmbeddings: (Float32Array | null)[] = []): Promise<void> {
    await transaction(this.db, async () => {
      await this.db.run(
        'INSERT INTO species (id, scientific_name, kind, family, toxicity, data, search_text) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          record.id,
          record.scientificName,
          record.kind,
          record.taxonomy.family ?? null,
          record.toxicity.level,
          JSON.stringify(record),
          searchText(record),
        ],
      );
      for (const [index, image] of record.images.entries()) {
        const embedding = imageEmbeddings[index];
        await this.db.run(
          'INSERT INTO species_images (species_id, file, license, attribution, source_url, embedding) VALUES (?, ?, ?, ?, ?, ?)',
          [record.id, image.file, image.license, image.attribution, image.sourceUrl, embedding ? vectorToBlob(embedding) : null],
        );
      }
    });
    this.imageVectors = null;
  }

  async setVisionModel(id: string): Promise<void> {
    await setMeta(this.db, VISION_MODEL_KEY, id);
  }

  /**
   * Ricalcola gli embedding delle immagini con il modello visivo attivo: serve quando il pacchetto
   * è stato costruito con un modello diverso da quello installato sul dispositivo.
   */
  async rebuildImageEmbeddings(
    vision: VisionEmbedder,
    loadImage: (file: string) => Promise<RgbaImage>,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ embedded: number; failed: number }> {
    const rows = await this.db.all<{ id: number; file: string }>('SELECT id, file FROM species_images ORDER BY id');
    let embedded = 0;
    let failed = 0;
    for (const [index, row] of rows.entries()) {
      try {
        const vector = await vision.embedImage(await loadImage(row.file));
        await this.db.run('UPDATE species_images SET embedding = ? WHERE id = ?', [vectorToBlob(vector), row.id]);
        embedded++;
      } catch {
        await this.db.run('UPDATE species_images SET embedding = NULL WHERE id = ?', [row.id]);
        failed++;
      }
      onProgress?.(index + 1, rows.length);
    }
    await this.setVisionModel(vision.id);
    this.imageVectors = null;
    return { embedded, failed };
  }

  async visionModel(): Promise<string | null> {
    return getMeta(this.db, VISION_MODEL_KEY);
  }

  async count(): Promise<number> {
    const row = await getRow<{ total: number }>(this.db, 'SELECT COUNT(*) AS total FROM species');
    return row?.total ?? 0;
  }

  async get(id: string): Promise<SpeciesRecord | null> {
    const row = await getRow<{ data: string }>(this.db, 'SELECT data FROM species WHERE id = ?', [id]);
    return row ? (JSON.parse(row.data) as SpeciesRecord) : null;
  }

  async getMany(ids: string[]): Promise<SpeciesRecord[]> {
    const records: SpeciesRecord[] = [];
    for (const id of ids) {
      const record = await this.get(id);
      if (record) records.push(record);
    }
    return records;
  }

  async list(kind?: 'plant' | 'fungus'): Promise<SpeciesRecord[]> {
    const rows = kind
      ? await this.db.all<{ data: string }>('SELECT data FROM species WHERE kind = ? ORDER BY scientific_name', [kind])
      : await this.db.all<{ data: string }>('SELECT data FROM species ORDER BY scientific_name');
    return rows.map((row) => JSON.parse(row.data) as SpeciesRecord);
  }

  /** Ricerca testuale: prima il nome esatto (scientifico o comune), poi full-text sulle schede. */
  async searchText(query: string, limit = 5): Promise<SpeciesRecord[]> {
    const found = new Map<string, SpeciesRecord>();
    for (const record of await this.findMentioned(query)) found.set(record.id, record);

    const ftsQuery = buildFtsQuery(query);
    if (ftsQuery && found.size < limit) {
      const rows = await this.db.all<{ data: string }>(
        'SELECT s.data FROM species s JOIN species_fts f ON f.rowid = s.rowid ' +
          'WHERE species_fts MATCH ? ORDER BY bm25(species_fts) LIMIT ?',
        [ftsQuery, limit],
      );
      for (const row of rows) {
        const record = JSON.parse(row.data) as SpeciesRecord;
        if (!found.has(record.id)) found.set(record.id, record);
      }
    }
    return [...found.values()].slice(0, limit);
  }

  /** Specie nominate esplicitamente nel testo (nome scientifico o comune). */
  async findMentioned(text: string): Promise<SpeciesRecord[]> {
    const normalizedQuery = normalizeText(text);
    const rows = await this.db.all<{ data: string }>('SELECT data FROM species');
    return rows
      .map((row) => JSON.parse(row.data) as SpeciesRecord)
      .filter((record) =>
        [record.scientificName, ...Object.values(record.commonNames).flat()]
          .map(normalizeText)
          .some((name) => name.length >= 4 && new RegExp(`\\b${escapeRegExp(name)}\\b`).test(normalizedQuery)),
      );
  }

  /**
   * Immagini del catalogo più simili al vettore della foto, una voce per specie (la migliore).
   * Il coseno è una somiglianza visiva, non una probabilità di identificazione.
   */
  async visualSearch(queryVector: Float32Array, limit: number, kind?: 'plant' | 'fungus'): Promise<ImageMatch[]> {
    const vectors = await this.loadImageVectors();
    const best = new Map<string, number>();
    for (const [index, vector] of vectors.matrix.entries()) {
      const speciesId = vectors.speciesIds[index];
      if (speciesId === undefined) continue;
      const cosine = dot(queryVector, vector);
      if (cosine > (best.get(speciesId) ?? -Infinity)) best.set(speciesId, cosine);
    }
    let matches = [...best.entries()].map(([speciesId, cosine]) => ({ speciesId, cosine }));
    if (kind) {
      const allowed = new Set(
        (await this.db.all<{ id: string }>('SELECT id FROM species WHERE kind = ?', [kind])).map((row) => row.id),
      );
      matches = matches.filter((match) => allowed.has(match.speciesId));
    }
    return matches.sort((a, b) => b.cosine - a.cosine).slice(0, limit);
  }

  async images(speciesId: string): Promise<SpeciesImage[]> {
    const rows = await this.db.all<{ file: string; license: string; attribution: string; source_url: string }>(
      'SELECT file, license, attribution, source_url FROM species_images WHERE species_id = ? ORDER BY id',
      [speciesId],
    );
    return rows.map((row) => ({
      file: row.file,
      license: row.license,
      attribution: row.attribution,
      sourceUrl: row.source_url,
    }));
  }

  private async loadImageVectors(): Promise<{ speciesIds: string[]; matrix: Float32Array[] }> {
    if (!this.imageVectors) {
      const rows = await this.db.all<{ species_id: string; embedding: Uint8Array }>(
        'SELECT species_id, embedding FROM species_images WHERE embedding IS NOT NULL ORDER BY id',
      );
      this.imageVectors = {
        speciesIds: rows.map((row) => row.species_id),
        matrix: rows.map((row) => blobToVector(row.embedding)),
      };
    }
    return this.imageVectors;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
