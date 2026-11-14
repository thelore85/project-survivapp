import {
  Catalogue,
  ConversationStore,
  DEFAULT_PACKAGE_CONFIG,
  LibraryStore,
  ModelManager,
  Orchestrator,
  SettingsStore,
  UserFiles,
  resolveConfig,
  selectProfile,
  type DeviceCapabilities,
  type EffectiveConfig,
  type ExecutionProfile,
  type PackageConfig,
} from '@survivapp/core';
import { initPlatform } from '../platform';
import type { Platform } from '../platform/types';

/** Oggetti del core già collegati alla piattaforma: l'interfaccia parla solo con questi. */
export interface Services {
  platform: Platform;
  packageConfig: PackageConfig;
  orchestrator: Orchestrator;
  conversations: ConversationStore;
  catalogue: Catalogue;
  baseLibrary: LibraryStore | null;
  userLibrary: LibraryStore;
  userFiles: UserFiles;
  settings: SettingsStore;
  models: ModelManager;
  capabilities: DeviceCapabilities;
  profile: ExecutionProfile;
  loadConfig(): Promise<EffectiveConfig>;
}

/** Composition root: l'unico punto in cui piattaforma e core vengono assemblati. */
export async function createServices(): Promise<Services> {
  const platform = await initPlatform();
  const packageConfig = platform.manifest?.config ?? DEFAULT_PACKAGE_CONFIG;

  const capabilities = await platform.capabilities();
  const profile = selectProfile(capabilities);
  const disabled = new Set(profile.disabled);
  const models = new ModelManager(
    {
      ...(disabled.has('generation') ? {} : { llm: platform.models.llm }),
      ...(disabled.has('semantic_search') ? {} : { textEmbedder: platform.models.textEmbedder }),
      ...(disabled.has('visual_identification') ? {} : { vision: platform.models.vision }),
    },
    profile.maxLoadedModels,
  );

  // Senza pacchetto il catalogo punta al database utente, che ha le stesse tabelle ma vuote.
  const catalogue = new Catalogue(platform.content ?? platform.user);
  const baseLibrary = platform.content ? new LibraryStore('base', platform.content) : null;
  const userLibrary = new LibraryStore('user', platform.user);
  const conversations = new ConversationStore(platform.user);
  const settings = new SettingsStore(platform.user);

  return {
    platform,
    packageConfig,
    orchestrator: new Orchestrator({
      conversations,
      catalogue,
      stores: baseLibrary ? [baseLibrary, userLibrary] : [userLibrary],
      models,
    }),
    conversations,
    catalogue,
    baseLibrary,
    userLibrary,
    userFiles: new UserFiles(userLibrary, platform.extractors),
    settings,
    models,
    capabilities,
    profile,
    loadConfig: async () => resolveConfig(packageConfig, await settings.load()),
  };
}
