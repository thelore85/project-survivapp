import type { EffectiveConfig } from './config';
import { t, type MessageKey } from './i18n';
import type { PageText } from './library/chunking';
import type { DocumentInfo, IngestReport, LibraryStore } from './library/store';
import type { TextEmbedder } from './runtime/types';
import type { Lang } from './types';

const MB = 1024 * 1024;

export type ImportErrorCode =
  | 'format_not_allowed'
  | 'file_too_large'
  | 'quota_exceeded'
  | 'empty_document'
  | 'extraction_failed';

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Estrae il testo di un file: l'implementazione dipende dalla piattaforma (pattern Strategy). */
export interface TextExtractor {
  extract(bytes: Uint8Array, format: string): Promise<PageText[]>;
}

/** Estrattore per i file di testo semplice: nessuna pagina, un unico blocco. */
export const plainTextExtractor: TextExtractor = {
  async extract(bytes) {
    return [{ page: null, text: new TextDecoder('utf-8').decode(bytes) }];
  },
};

export interface UserFileInput {
  name: string;
  bytes: Uint8Array;
}

function formatOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** File caricati dall'utente: applica formato, dimensione e quota prima di indicizzare. */
export class UserFiles {
  constructor(
    private readonly store: LibraryStore,
    private readonly extractors: Record<string, TextExtractor>,
  ) {}

  async usedBytes(): Promise<number> {
    return this.store.totalSizeBytes();
  }

  list(): Promise<DocumentInfo[]> {
    return this.store.listDocuments();
  }

  /** Controlla i limiti senza importare; lancia ImportError con messaggio localizzato. */
  async check(name: string, sizeBytes: number, config: EffectiveConfig, lang: Lang): Promise<void> {
    const fail = (code: ImportErrorCode, params: Record<string, string | number> = {}): never => {
      throw new ImportError(code, t(lang, `userfile.${code}` as MessageKey, params));
    };
    const format = formatOf(name);
    if (!config.allowedUserFormats.includes(format) || !this.extractors[format]) fail('format_not_allowed');
    if (sizeBytes > config.maxUserFileMb * MB) fail('file_too_large', { limit: config.maxUserFileMb });
    const used = await this.usedBytes();
    if (used + sizeBytes > config.userQuotaMb * MB) {
      fail('quota_exceeded', { limit: config.userQuotaMb, used: Math.round(used / MB) });
    }
  }

  async import(
    file: UserFileInput,
    config: EffectiveConfig,
    lang: Lang,
    embedder: TextEmbedder | null,
  ): Promise<IngestReport> {
    await this.check(file.name, file.bytes.byteLength, config, lang);
    const format = formatOf(file.name);
    const extractor = this.extractors[format];
    if (!extractor) throw new ImportError('format_not_allowed', t(lang, 'userfile.format_not_allowed'));

    let pages: PageText[];
    try {
      pages = await extractor.extract(file.bytes, format);
    } catch {
      throw new ImportError('extraction_failed', t(lang, 'userfile.extraction_failed'));
    }

    try {
      return await this.store.ingest(
        {
          id: `user-${slug(file.name)}`,
          title: file.name.replace(/\.[^.]+$/, ''),
          fileName: file.name,
          sizeBytes: file.bytes.byteLength,
          source: 'user',
          reliability: 'current',
        },
        pages,
        embedder,
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'empty_document') {
        throw new ImportError('empty_document', t(lang, 'userfile.empty_document'));
      }
      throw error;
    }
  }

  remove(documentId: string): Promise<boolean> {
    return this.store.remove(documentId);
  }

  /** Ricostruisce l'indice semantico dei file utente, ad esempio dopo un cambio di modello. */
  rebuildIndex(embedder: TextEmbedder): Promise<number> {
    return this.store.rebuildEmbeddings(embedder);
  }
}
