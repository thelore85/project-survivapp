import type { DeviceCapabilities, ModelSet, PackageManifest, SqlDb, TextExtractor } from '@survivapp/core';

/**
 * Tutto ciò che cambia tra browser e telefono (pattern Adapter): database, pacchetto base,
 * modelli ed estrazione del testo. Il resto dell'app usa solo questa interfaccia.
 */
export interface Platform {
  /** True quando girano i modelli finti: l'interfaccia lo dichiara all'utente. */
  demo: boolean;
  /** Database del pacchetto base, in sola lettura; null se nessun pacchetto è installato. */
  content: SqlDb | null;
  user: SqlDb;
  manifest: PackageManifest | null;
  models: ModelSet;
  extractors: Record<string, TextExtractor>;
  /** Indirizzo visualizzabile di un'immagine del pacchetto, es. `images/x.jpg`. */
  imageUri(file: string): string;
  capabilities(): Promise<DeviceCapabilities>;
  /** Installa o aggiorna il pacchetto base da una cartella scelta dall'utente; assente dove non serve. */
  installPackage?(): Promise<PackageManifest>;
  /**
   * Ricalcola gli indici del pacchetto con i modelli del dispositivo. Presente solo quando il pacchetto
   * è stato indicizzato con modelli diversi da quelli installati.
   */
  reindexPackage?(onProgress: (done: number, total: number) => void): Promise<void>;
  /** Messaggi su ciò che non è stato possibile inizializzare. */
  warnings: string[];
}
