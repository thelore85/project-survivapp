import type { SqlDb } from './db/sql';
import type { Lang } from './types';

/** Valori decisi da chi prepara il pacchetto base: l'utente non li cambia. */
export interface PackageConfig {
  defaultLanguage: Lang;
  /** Dimensione massima di un singolo file utente. */
  maxUserFileMb: number;
  defaultUserQuotaMb: number;
  minUserQuotaMb: number;
  maxUserQuotaMb: number;
  allowedUserFormats: string[];
}

/** Scelte dell'utente, salvate nel database locale. */
export interface UserSettings {
  language?: Lang;
  userQuotaMb?: number;
}

export interface EffectiveConfig extends PackageConfig {
  language: Lang;
  userQuotaMb: number;
}

export const DEFAULT_PACKAGE_CONFIG: PackageConfig = {
  defaultLanguage: 'it',
  maxUserFileMb: 100,
  defaultUserQuotaMb: 200,
  minUserQuotaMb: 50,
  maxUserQuotaMb: 2000,
  allowedUserFormats: ['pdf', 'txt', 'md'],
};

/** Completa una configurazione di pacchetto parziale e scarta i valori non validi. */
export function normalizePackageConfig(raw: Partial<PackageConfig> | null | undefined): PackageConfig {
  const merged = { ...DEFAULT_PACKAGE_CONFIG, ...(raw ?? {}) };
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  const config: PackageConfig = {
    defaultLanguage: ['it', 'en', 'es'].includes(merged.defaultLanguage) ? merged.defaultLanguage : 'it',
    maxUserFileMb: positive(merged.maxUserFileMb, DEFAULT_PACKAGE_CONFIG.maxUserFileMb),
    defaultUserQuotaMb: positive(merged.defaultUserQuotaMb, DEFAULT_PACKAGE_CONFIG.defaultUserQuotaMb),
    minUserQuotaMb: positive(merged.minUserQuotaMb, DEFAULT_PACKAGE_CONFIG.minUserQuotaMb),
    maxUserQuotaMb: positive(merged.maxUserQuotaMb, DEFAULT_PACKAGE_CONFIG.maxUserQuotaMb),
    allowedUserFormats: Array.isArray(merged.allowedUserFormats)
      ? merged.allowedUserFormats.filter((format) => DEFAULT_PACKAGE_CONFIG.allowedUserFormats.includes(format))
      : DEFAULT_PACKAGE_CONFIG.allowedUserFormats,
  };
  if (config.minUserQuotaMb > config.maxUserQuotaMb) config.minUserQuotaMb = config.maxUserQuotaMb;
  return config;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Configurazione a livelli: i default arrivano dal pacchetto, le scelte dell'utente li sovrascrivono
 * solo per le chiavi previste. Le policy di sicurezza non passano di qui: non sono configurabili.
 */
export function resolveConfig(packageConfig: PackageConfig, settings: UserSettings): EffectiveConfig {
  return {
    ...packageConfig,
    language: settings.language ?? packageConfig.defaultLanguage,
    userQuotaMb: clamp(
      settings.userQuotaMb ?? packageConfig.defaultUserQuotaMb,
      packageConfig.minUserQuotaMb,
      packageConfig.maxUserQuotaMb,
    ),
  };
}

const USER_KEYS = ['language', 'userQuotaMb'] as const;

/** Impostazioni dell'utente persistite: accetta solo le chiavi sovrascrivibili. */
export class SettingsStore {
  constructor(private readonly db: SqlDb) {}

  async load(): Promise<UserSettings> {
    const rows = await this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    const settings: UserSettings = {};
    for (const row of rows) {
      const value: unknown = JSON.parse(row.value);
      if (row.key === 'language' && (value === 'it' || value === 'en' || value === 'es')) settings.language = value;
      if (row.key === 'userQuotaMb' && typeof value === 'number') settings.userQuotaMb = value;
    }
    return settings;
  }

  async save(settings: UserSettings): Promise<void> {
    for (const key of USER_KEYS) {
      const value = settings[key];
      if (value === undefined) continue;
      await this.db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  }

  async reset(): Promise<void> {
    await this.db.run('DELETE FROM settings');
  }
}
