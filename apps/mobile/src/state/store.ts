import {
  ImportError,
  type ConversationInfo,
  type DocumentInfo,
  type EffectiveConfig,
  type Lang,
  type ModelStatus,
  type SpeciesRecord,
  type StoredMessage,
  type Theme,
} from '@survivapp/core';
import { colorScheme } from 'nativewind';
import { create } from 'zustand';
import { pickFile } from '../platform/files';
import { decodeImage, pickImage, thumbnailDataUri } from '../platform/images';
import { createServices, type Services } from '../services/app';
import { tr } from '../strings';

export type Screen = 'chat' | 'history' | 'library' | 'settings';

export interface Feedback {
  kind: 'ok' | 'error';
  text: string;
}

interface AppState {
  status: 'loading' | 'ready' | 'error';
  startupError: string | null;
  services: Services | null;
  config: EffectiveConfig | null;
  lang: Lang;
  screen: Screen;

  conversations: ConversationInfo[];
  activeId: string | null;
  messages: StoredMessage[];
  busy: boolean;
  progress: string | null;
  chatError: string | null;
  pendingImage: { uri: string } | null;

  baseDocuments: DocumentInfo[];
  userDocuments: DocumentInfo[];
  usedBytes: number;
  importing: boolean;
  libraryFeedback: Feedback | null;
  settingsFeedback: Feedback | null;
  modelStatus: ModelStatus[];
  species: SpeciesRecord | null;

  init(): Promise<void>;
  setScreen(screen: Screen): void;
  newConversation(): void;
  openConversation(id: string): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  clearHistory(): Promise<void>;
  attachImage(source: 'camera' | 'library'): Promise<void>;
  clearImage(): void;
  send(text: string): Promise<void>;
  refreshLibrary(): Promise<void>;
  importFile(): Promise<void>;
  removeFile(id: string): Promise<void>;
  rebuildIndex(): Promise<void>;
  setLanguage(lang: Lang): Promise<void>;
  setQuota(quotaMb: number): Promise<void>;
  setTheme(theme: Theme): Promise<void>;
  showSpecies(id: string | null): Promise<void>;
  installPackage(): Promise<void>;
  reindexPackage(): Promise<void>;
}

function newId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Stato dell'interfaccia (Zustand): le schermate leggono da qui e chiamano queste azioni. */
export const useApp = create<AppState>((set, get) => ({
  status: 'loading',
  startupError: null,
  services: null,
  config: null,
  lang: 'it',
  screen: 'chat',
  conversations: [],
  activeId: null,
  messages: [],
  busy: false,
  progress: null,
  chatError: null,
  pendingImage: null,
  baseDocuments: [],
  userDocuments: [],
  usedBytes: 0,
  importing: false,
  libraryFeedback: null,
  settingsFeedback: null,
  modelStatus: [],
  species: null,

  async init() {
    try {
      const services = await createServices();
      const config = await services.loadConfig();
      colorScheme.set(config.theme);
      set({
        services,
        config,
        lang: config.language,
        conversations: await services.conversations.list(),
        modelStatus: services.models.status(),
        status: 'ready',
      });
      await get().refreshLibrary();
    } catch (error) {
      set({ status: 'error', startupError: message(error) });
    }
  },

  setScreen(screen) {
    set({ screen, libraryFeedback: null, settingsFeedback: null });
  },

  newConversation() {
    set({ activeId: null, messages: [], chatError: null, pendingImage: null, screen: 'chat' });
  },

  async openConversation(id) {
    const { services } = get();
    if (!services) return;
    set({ activeId: id, messages: await services.conversations.messages(id), chatError: null, screen: 'chat' });
  },

  async deleteConversation(id) {
    const { services, activeId } = get();
    if (!services) return;
    await services.conversations.delete(id);
    set({
      conversations: await services.conversations.list(),
      ...(activeId === id ? { activeId: null, messages: [] } : {}),
    });
  },

  async clearHistory() {
    const { services } = get();
    if (!services) return;
    await services.conversations.deleteAll();
    set({ conversations: [], activeId: null, messages: [] });
  },

  async attachImage(source) {
    try {
      const image = await pickImage(source);
      if (image) set({ pendingImage: image, chatError: null });
    } catch (error) {
      set({ chatError: message(error) });
    }
  },

  clearImage() {
    set({ pendingImage: null });
  },

  async send(text) {
    const { services, lang, pendingImage, busy } = get();
    const trimmed = text.trim();
    if (!services || busy || (!trimmed && !pendingImage)) return;
    const conversationId = get().activeId ?? newId();
    set({
      busy: true,
      chatError: null,
      activeId: conversationId,
      pendingImage: null,
      progress: tr(lang, pendingImage ? 'chat.working.photo' : 'chat.working'),
    });

    try {
      const image = pendingImage
        ? { pixels: await decodeImage(pendingImage.uri), ref: await thumbnailDataUri(pendingImage.uri) }
        : undefined;
      // Messaggio dell'utente mostrato subito; la versione salvata arriva dal database a fine turno.
      set({
        messages: [
          ...get().messages,
          { id: -1, role: 'user', text: trimmed, imageRef: image?.ref ?? null, createdAt: new Date().toISOString() },
        ],
      });

      let words = 0;
      await services.orchestrator.handle({
        conversationId,
        text: trimmed,
        lang,
        image,
        // Il testo generato non si mostra mentre arriva: prima deve passare i controlli di sicurezza.
        onToken: () => {
          words++;
          if (words % 5 === 0) set({ progress: tr(lang, 'chat.working.words', { count: words }) });
        },
      });
    } catch (error) {
      set({ chatError: message(error) });
    } finally {
      const stored = await services.conversations.messages(conversationId).catch(() => get().messages);
      set({
        busy: false,
        progress: null,
        messages: stored,
        conversations: await services.conversations.list().catch(() => get().conversations),
        modelStatus: services.models.status(),
      });
    }
  },

  async refreshLibrary() {
    const { services } = get();
    if (!services) return;
    set({
      baseDocuments: services.baseLibrary ? await services.baseLibrary.listDocuments() : [],
      userDocuments: await services.userFiles.list(),
      usedBytes: await services.userFiles.usedBytes(),
    });
  },

  async importFile() {
    const { services, config, lang } = get();
    if (!services || !config) return;
    set({ libraryFeedback: null });
    try {
      const file = await pickFile();
      if (!file) return;
      set({ importing: true });
      // I limiti si controllano prima di leggere il file: un file da 2 GB non deve entrare in memoria.
      await services.userFiles.check(file.name, file.size, config, lang);
      const report = await services.userFiles.import(
        { name: file.name, bytes: await file.read() },
        config,
        lang,
        await services.models.textEmbedder(),
      );
      set({
        libraryFeedback: {
          kind: 'ok',
          text: tr(lang, 'library.user.imported', { pages: report.pageCount, chunks: report.chunkCount }),
        },
      });
    } catch (error) {
      set({ libraryFeedback: { kind: 'error', text: error instanceof ImportError ? error.message : message(error) } });
    } finally {
      set({ importing: false, modelStatus: services.models.status() });
      await get().refreshLibrary();
    }
  },

  async removeFile(id) {
    const { services } = get();
    if (!services) return;
    await services.userFiles.remove(id);
    set({ libraryFeedback: null });
    await get().refreshLibrary();
  },

  async rebuildIndex() {
    const { services, lang } = get();
    if (!services) return;
    try {
      const embedder = await services.models.textEmbedder();
      if (!embedder) throw new Error(tr(lang, 'settings.model.unavailable'));
      const count = await services.userFiles.rebuildIndex(embedder);
      set({ settingsFeedback: { kind: 'ok', text: tr(lang, 'settings.rebuilt', { count }) } });
    } catch (error) {
      set({ settingsFeedback: { kind: 'error', text: message(error) } });
    }
    set({ modelStatus: services.models.status() });
    await get().refreshLibrary();
  },

  async setLanguage(lang) {
    const { services } = get();
    if (!services) return;
    await services.settings.save({ language: lang });
    set({ lang, config: await services.loadConfig() });
  },

  async setTheme(theme) {
    const { services } = get();
    if (!services) return;
    colorScheme.set(theme);
    await services.settings.save({ theme });
    set({ config: await services.loadConfig() });
  },

  async setQuota(quotaMb) {
    const { services } = get();
    if (!services) return;
    await services.settings.save({ userQuotaMb: quotaMb });
    set({ config: await services.loadConfig() });
  },

  async installPackage() {
    const { services, lang } = get();
    const install = services?.platform.installPackage;
    if (!install) return;
    try {
      const manifest = await install();
      // Il pacchetto cambia database, catalogo e modelli: si ricompone tutto da capo.
      set({ status: 'loading', services: null });
      await get().init();
      set({
        screen: 'settings',
        settingsFeedback: { kind: 'ok', text: tr(lang, 'settings.package.installed', { id: manifest.id, version: manifest.version }) },
      });
    } catch (error) {
      set({ settingsFeedback: { kind: 'error', text: message(error) } });
    }
  },

  async reindexPackage() {
    const { services, lang } = get();
    const reindex = services?.platform.reindexPackage;
    if (!reindex) return;
    try {
      await reindex((done, total) =>
        set({ settingsFeedback: { kind: 'ok', text: tr(lang, 'settings.package.reindexing', { done, total }) } }),
      );
      set({ status: 'loading', services: null });
      await get().init();
      set({ screen: 'settings' });
    } catch (error) {
      set({ settingsFeedback: { kind: 'error', text: message(error) } });
    }
  },

  async showSpecies(id) {
    const { services } = get();
    if (!services || !id) {
      set({ species: null });
      return;
    }
    set({ species: await services.catalogue.get(id) });
  },
}));
