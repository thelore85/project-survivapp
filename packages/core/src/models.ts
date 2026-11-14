import type { LlmRuntime, ManagedModel, TextEmbedder, VisionEmbedder } from './runtime/types';

export type ModelRole = 'llm' | 'textEmbedder' | 'vision';

export interface ModelSet {
  llm?: LlmRuntime;
  textEmbedder?: TextEmbedder;
  vision?: VisionEmbedder;
}

export interface ModelStatus {
  role: ModelRole;
  id: string | null;
  available: boolean;
  loaded: boolean;
  error: string | null;
}

/** Ciò che i domini chiedono ai modelli: l'orchestratore dipende da questa porta, non dal gestore. */
export interface ModelProvider {
  llm(): Promise<LlmRuntime | null>;
  textEmbedder(): Promise<TextEmbedder | null>;
  vision(): Promise<VisionEmbedder | null>;
}

/**
 * Carica i modelli su richiesta e ne tiene in memoria al massimo `maxLoaded`.
 * Se un caricamento fallisce (tipicamente memoria insufficiente) rilascia gli altri e riprova una volta;
 * se fallisce ancora la funzione resta disabilitata invece di far cadere l'app.
 */
export class ModelManager implements ModelProvider {
  private readonly lastUsed = new Map<ModelRole, number>();
  private readonly errors = new Map<ModelRole, string>();
  private clock = 0;

  constructor(
    private readonly models: ModelSet,
    private maxLoaded: number,
  ) {}

  setMaxLoaded(maxLoaded: number): void {
    this.maxLoaded = Math.max(1, maxLoaded);
  }

  llm(): Promise<LlmRuntime | null> {
    return this.acquire('llm') as Promise<LlmRuntime | null>;
  }

  textEmbedder(): Promise<TextEmbedder | null> {
    return this.acquire('textEmbedder') as Promise<TextEmbedder | null>;
  }

  vision(): Promise<VisionEmbedder | null> {
    return this.acquire('vision') as Promise<VisionEmbedder | null>;
  }

  private async acquire(role: ModelRole): Promise<ManagedModel | null> {
    const model = this.models[role];
    if (!model) return null;
    this.lastUsed.set(role, ++this.clock);
    if (model.isLoaded()) return model;

    await this.makeRoom(role);
    try {
      await model.load();
    } catch {
      await this.releaseAll(role);
      try {
        await model.load();
      } catch (error) {
        this.errors.set(role, error instanceof Error ? error.message : String(error));
        return null;
      }
    }
    this.errors.delete(role);
    return model;
  }

  /** Rilascia i modelli usati meno di recente finché c'è posto per uno nuovo. */
  private async makeRoom(incoming: ModelRole): Promise<void> {
    const loaded = (Object.keys(this.models) as ModelRole[])
      .filter((role) => role !== incoming && this.models[role]?.isLoaded())
      .sort((a, b) => (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0));
    while (loaded.length >= this.maxLoaded) {
      const role = loaded.shift();
      if (role) await this.models[role]?.unload();
    }
  }

  async release(role: ModelRole): Promise<void> {
    const model = this.models[role];
    if (model?.isLoaded()) await model.unload();
  }

  async releaseAll(except?: ModelRole): Promise<void> {
    for (const role of Object.keys(this.models) as ModelRole[]) {
      if (role !== except) await this.release(role);
    }
  }

  status(): ModelStatus[] {
    return (['llm', 'textEmbedder', 'vision'] as const).map((role) => {
      const model = this.models[role];
      return {
        role,
        id: model?.id ?? null,
        available: model !== undefined && !this.errors.has(role),
        loaded: model?.isLoaded() ?? false,
        error: this.errors.get(role) ?? null,
      };
    });
  }
}

export interface DeviceCapabilities {
  totalRamMb: number;
  freeStorageMb: number;
  /** Il runtime di inferenza nativo è utilizzabile su questo dispositivo. */
  runtimeSupported: boolean;
  accelerators: string[];
}

export type Feature = 'generation' | 'visual_identification' | 'semantic_search';

export interface ExecutionProfile {
  id: 'full' | 'sequential' | 'minimal' | 'retrieval_only';
  maxLoadedModels: number;
  disabled: Feature[];
  reasons: string[];
}

/**
 * Sceglie come usare i modelli in base alle risorse del dispositivo.
 * Le soglie sono ipotesi iniziali: vanno tarate con i benchmark sul dispositivo reale.
 */
export function selectProfile(capabilities: DeviceCapabilities, requiredStorageMb = 0): ExecutionProfile {
  const allFeatures: Feature[] = ['generation', 'visual_identification', 'semantic_search'];
  if (!capabilities.runtimeSupported) {
    return { id: 'retrieval_only', maxLoadedModels: 1, disabled: allFeatures, reasons: ['runtime_unsupported'] };
  }
  if (capabilities.freeStorageMb < requiredStorageMb) {
    return { id: 'retrieval_only', maxLoadedModels: 1, disabled: allFeatures, reasons: ['storage_insufficient'] };
  }
  if (capabilities.totalRamMb >= 12000) return { id: 'full', maxLoadedModels: 3, disabled: [], reasons: [] };
  if (capabilities.totalRamMb >= 8000) {
    return { id: 'sequential', maxLoadedModels: 2, disabled: [], reasons: ['ram_limited'] };
  }
  if (capabilities.totalRamMb >= 6000) return { id: 'minimal', maxLoadedModels: 1, disabled: [], reasons: ['ram_low'] };
  return { id: 'retrieval_only', maxLoadedModels: 1, disabled: allFeatures, reasons: ['ram_insufficient'] };
}
