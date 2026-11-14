import {
  FakeLlm,
  FakeTextEmbedder,
  FakeVisionEmbedder,
  migrate,
  parseManifest,
  plainTextExtractor,
  type ModelEntry,
  type ModelSet,
  type PackageManifest,
  type RunResult,
  type SqlDb,
  type SqlValue,
  type TextExtractor,
} from '@survivapp/core';
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { LlamaLlm, LlamaTextEmbedder, OnnxVisionEmbedder } from './runtimes.native';
import type { Platform } from './types';

/*
 * Piattaforma Android. NON VERIFICATA SU DISPOSITIVO: compila e passa il controllo dei tipi,
 * ma non è mai stata eseguita su un telefono o un emulatore. Vedi docs/RESOCONTO.md.
 */

const PACKAGE_DIR = 'package';

class ExpoSqlDb implements SqlDb {
  constructor(private readonly db: SQLiteDatabase) {}

  exec(sql: string): Promise<void> {
    return this.db.execAsync(sql);
  }

  async run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
    const result = await this.db.runAsync(sql, params);
    return { lastInsertRowid: result.lastInsertRowId, changes: result.changes };
  }

  all<T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params);
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}

function toPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

const unsupportedPdf: TextExtractor = {
  async extract() {
    // pdf.js non gira sul motore JavaScript di React Native: serve un modulo nativo, non ancora scelto.
    throw new Error('pdf_import_not_supported_on_device');
  },
};

const DEFAULT_TEXT_THRESHOLD = 0.3;
const DEFAULT_VISION_THRESHOLD = 0.2;

/** Sceglie finto o reale dall'identificativo scritto nel manifest: così il pacchetto demo funziona anche sul telefono. */
function buildModels(manifest: PackageManifest | null, packageDir: Directory, warnings: string[]): { models: ModelSet; demo: boolean } {
  const modelFile = (entry: ModelEntry | null): File | null => {
    if (!entry?.file) return null;
    const file = new File(packageDir, 'models', entry.file);
    if (!file.exists) {
      warnings.push(`model_file_missing: ${entry.file}`);
      return null;
    }
    return file;
  };
  const models: ModelSet = {};
  let demo = false;

  const llm = manifest?.models.llm ?? null;
  const llmFile = modelFile(llm);
  if (llm && llmFile) models.llm = new LlamaLlm(llm.id, llmFile.uri);
  else {
    models.llm = new FakeLlm();
    demo = true;
  }

  const text = manifest?.models.textEmbedder ?? null;
  const textFile = modelFile(text);
  if (text && textFile) models.textEmbedder = new LlamaTextEmbedder(text.id, textFile.uri, text.relevanceThreshold ?? DEFAULT_TEXT_THRESHOLD);
  else {
    models.textEmbedder = new FakeTextEmbedder();
    demo = true;
  }

  const vision = manifest?.models.vision ?? null;
  const visionFile = modelFile(vision);
  if (vision && visionFile) {
    models.vision = new OnnxVisionEmbedder(vision.id, toPath(visionFile.uri), vision.relevanceThreshold ?? DEFAULT_VISION_THRESHOLD);
  } else {
    models.vision = new FakeVisionEmbedder();
    demo = true;
  }
  return { models, demo };
}

function copyDirectory(source: Directory, target: Directory): void {
  target.create({ intermediates: true, idempotent: true });
  for (const entry of source.list()) {
    if (entry instanceof Directory) copyDirectory(entry, new Directory(target, entry.name));
    else entry.copy(new File(target, entry.name));
  }
}

/**
 * Installa o aggiorna il pacchetto base: l'utente sceglie la cartella copiata sul telefono
 * (deve contenere manifest.json) e l'app la copia nel proprio spazio privato.
 */
export async function installPackage(): Promise<PackageManifest> {
  const picked = await Directory.pickDirectoryAsync();
  const manifestFile = new File(picked, 'manifest.json');
  if (!manifestFile.exists) throw new Error('manifest.json non trovato nella cartella scelta');
  const manifest = parseManifest(JSON.parse(await manifestFile.text()));

  const target = new Directory(Paths.document, PACKAGE_DIR);
  if (target.exists) target.delete();
  copyDirectory(picked, target);
  return manifest;
}

export async function initPlatform(): Promise<Platform> {
  const warnings: string[] = [];
  const packageDir = new Directory(Paths.document, PACKAGE_DIR);

  let manifest: PackageManifest | null = null;
  let content: SqlDb | null = null;
  try {
    const manifestFile = new File(packageDir, 'manifest.json');
    if (!manifestFile.exists) throw new Error('not_installed');
    manifest = parseManifest(JSON.parse(await manifestFile.text()));
    const database = await openDatabaseAsync(manifest.content.database, {}, toPath(packageDir.uri));
    // Il pacchetto base non si modifica: qualsiasi scrittura su questo database fallisce.
    await database.execAsync('PRAGMA query_only = ON');
    content = new ExpoSqlDb(database);
  } catch (error) {
    manifest = null;
    warnings.push(`package_missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  const user = new ExpoSqlDb(await openDatabaseAsync('user.db'));
  await migrate(user);

  const { models, demo } = buildModels(manifest, packageDir, warnings);
  const imagesDir = manifest?.content.imagesDir ?? 'images';

  return {
    demo,
    content,
    user,
    manifest,
    models,
    extractors: { txt: plainTextExtractor, md: plainTextExtractor, pdf: unsupportedPdf },
    imageUri: (file) => new File(packageDir, file.startsWith(`${imagesDir}/`) ? file : `${imagesDir}/${file}`).uri,
    async capabilities() {
      return {
        totalRamMb: Math.round((Device.totalMemory ?? 0) / 1024 / 1024),
        freeStorageMb: Math.round(Paths.availableDiskSpace / 1024 / 1024),
        runtimeSupported: (Device.supportedCpuArchitectures ?? []).some((arch) => arch === 'arm64-v8a' || arch === 'x86_64'),
        accelerators: [],
      };
    },
    installPackage,
    warnings,
  };
}
