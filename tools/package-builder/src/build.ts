import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  Catalogue,
  DEFAULT_PACKAGE_CONFIG,
  FakeTextEmbedder,
  FakeVisionEmbedder,
  LibraryStore,
  migrate,
  parseManifest,
  type PackageConfig,
  type PackageManifest,
  type PageText,
  type Reliability,
  type SpeciesRecord,
  type TextEmbedder,
  type VisionEmbedder,
} from '@survivapp/core';
import { NodeSqlDb } from '@survivapp/core/node';
import jpeg from 'jpeg-js';
import { extractPdfPages } from './pdf';

export interface DocumentEntry {
  id: string;
  file: string;
  title: string;
  author?: string;
  edition?: string;
  lang?: string;
  source?: string;
  license?: string;
  reliability?: Reliability;
}

export interface BuildOptions {
  /** Cartella con `documents.json` e i file dei documenti. */
  knowledgeBaseDir: string;
  /** Cartella con `species.json` e `images/`; se manca il pacchetto nasce senza catalogo. */
  catalogueDir: string | null;
  outDir: string;
  packageId: string;
  version: string;
  /** Cache del testo estratto dai PDF: l'estrazione è la parte lenta. */
  cacheDir?: string;
  config?: Partial<PackageConfig>;
  textEmbedder?: TextEmbedder;
  vision?: VisionEmbedder;
  log?: (message: string) => void;
}

export interface BuildResult {
  manifest: PackageManifest;
  warnings: string[];
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(
    () => true,
    () => false,
  );
}

async function readPages(file: string, cacheFile: string | null): Promise<PageText[]> {
  if (cacheFile && (await exists(cacheFile))) return JSON.parse(await readFile(cacheFile, 'utf8')) as PageText[];
  const bytes = new Uint8Array(await readFile(file));
  const pages = file.toLowerCase().endsWith('.pdf')
    ? await extractPdfPages(bytes)
    : [{ page: null, text: new TextDecoder('utf-8').decode(bytes) }];
  if (cacheFile) {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(pages));
  }
  return pages;
}

/**
 * Costruisce un pacchetto base: `content.db` con documenti indicizzati e catalogo, immagini e manifest.
 * Gli embedding dipendono dai modelli passati: l'app li userà solo se monta gli stessi modelli.
 */
export async function buildPackage(options: BuildOptions): Promise<BuildResult> {
  const log = options.log ?? (() => {});
  const warnings: string[] = [];
  const textEmbedder = options.textEmbedder ?? new FakeTextEmbedder();
  const vision = options.vision ?? new FakeVisionEmbedder();

  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(path.join(options.outDir, 'images'), { recursive: true });
  await mkdir(path.join(options.outDir, 'models'), { recursive: true });

  const db = new NodeSqlDb(path.join(options.outDir, 'content.db'));
  await migrate(db);
  const library = new LibraryStore('base', db);
  let chunkCount = 0;

  const documentsFile = path.join(options.knowledgeBaseDir, 'documents.json');
  const documents = (await exists(documentsFile))
    ? (JSON.parse(await readFile(documentsFile, 'utf8')) as DocumentEntry[])
    : [];
  for (const entry of documents) {
    const file = path.join(options.knowledgeBaseDir, entry.file);
    if (!(await exists(file))) {
      warnings.push(`documento mancante, saltato: ${entry.file}`);
      continue;
    }
    log(`documento: ${entry.title}`);
    const cacheFile = options.cacheDir ? path.join(options.cacheDir, `${entry.id}.json`) : null;
    const pages = await readPages(file, cacheFile);
    try {
      const report = await library.ingest(
        {
          id: entry.id,
          title: entry.title,
          author: entry.author,
          edition: entry.edition,
          lang: entry.lang,
          source: entry.source,
          license: entry.license,
          fileName: path.basename(entry.file),
          sizeBytes: (await stat(file)).size,
          reliability: entry.reliability,
        },
        pages,
        textEmbedder,
      );
      chunkCount += report.chunkCount;
      for (const warning of report.warnings) warnings.push(`${entry.id}: ${warning}`);
      log(`  ${report.pageCount} pagine, ${report.chunkCount} passaggi`);
    } catch (error) {
      warnings.push(`${entry.id}: importazione fallita (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  const catalogue = new Catalogue(db);
  const speciesFile = options.catalogueDir ? path.join(options.catalogueDir, 'species.json') : null;
  if (speciesFile && options.catalogueDir && (await exists(speciesFile))) {
    const records = JSON.parse(await readFile(speciesFile, 'utf8')) as SpeciesRecord[];
    const known = new Set(records.map((record) => record.id));
    log(`catalogo: ${records.length} specie`);
    for (const record of records) {
      const embeddings: (Float32Array | null)[] = [];
      const images = [];
      for (const image of record.images) {
        const source = path.join(options.catalogueDir, image.file);
        if (!(await exists(source))) {
          warnings.push(`${record.id}: immagine mancante ${image.file}`);
          continue;
        }
        try {
          const decoded = jpeg.decode(await readFile(source), { useTArray: true, maxMemoryUsageInMB: 512 });
          embeddings.push(await vision.embedImage({ width: decoded.width, height: decoded.height, data: decoded.data }));
          await cp(source, path.join(options.outDir, image.file));
          images.push(image);
        } catch {
          warnings.push(`${record.id}: immagine non leggibile ${image.file}`);
        }
      }
      await catalogue.insert(
        { ...record, images, lookalikes: record.lookalikes.filter((id) => known.has(id)) },
        embeddings,
      );
    }
  } else {
    warnings.push('catalogo assente: il pacchetto non contiene specie');
  }
  await catalogue.setVisionModel(vision.id);
  const speciesCount = await catalogue.count();
  const documentCount = (await library.listDocuments()).length;
  await db.exec('VACUUM');
  await db.close();

  const manifest = parseManifest({
    formatVersion: 1,
    id: options.packageId,
    version: options.version,
    createdAt: new Date().toISOString(),
    config: { ...DEFAULT_PACKAGE_CONFIG, ...(options.config ?? {}) },
    models: {
      llm: null,
      textEmbedder: { id: textEmbedder.id, file: null },
      vision: { id: vision.id, file: null },
    },
    content: { database: 'content.db', imagesDir: 'images' },
    stats: { species: speciesCount, documents: documentCount, chunks: chunkCount },
  });
  await writeFile(path.join(options.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, warnings };
}
