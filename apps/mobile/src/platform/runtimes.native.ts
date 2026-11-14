import { l2normalize, type LlmRequest, type LlmRuntime, type RgbaImage, type TextEmbedder, type VisionEmbedder } from '@survivapp/core';
import { initLlama, type LlamaContext } from 'llama.rn';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

/*
 * Runtime reali per Android. NON VERIFICATI SU DISPOSITIVO: scritti sulle API dichiarate da
 * llama.rn 0.13 e onnxruntime-react-native 1.24, mai eseguiti. Vedi docs/RESOCONTO.md.
 */

/** LLM locale in formato GGUF (ipotesi: Gemma 3n E2B) tramite llama.rn. */
export class LlamaLlm implements LlmRuntime {
  private context: LlamaContext | null = null;

  constructor(
    readonly id: string,
    private readonly modelUri: string,
  ) {}

  async load(): Promise<void> {
    this.context ??= await initLlama({ model: this.modelUri, n_ctx: 4096, n_gpu_layers: 99 });
  }

  async unload(): Promise<void> {
    await this.context?.release();
    this.context = null;
  }

  isLoaded(): boolean {
    return this.context !== null;
  }

  async generate(request: LlmRequest, onToken?: (token: string) => void): Promise<string> {
    await this.load();
    if (!this.context) throw new Error('llm_not_loaded');
    const result = await this.context.completion(
      {
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        n_predict: request.maxTokens ?? 400,
        temperature: 0.2,
      },
      (data) => onToken?.(data.token),
    );
    return result.text;
  }
}

/** Embedding testuali multilingua in formato GGUF (ipotesi: EmbeddingGemma) tramite llama.rn. */
export class LlamaTextEmbedder implements TextEmbedder {
  private context: LlamaContext | null = null;
  dim = 0;

  constructor(
    readonly id: string,
    private readonly modelUri: string,
    readonly relevanceThreshold: number,
  ) {}

  async load(): Promise<void> {
    if (this.context) return;
    this.context = await initLlama({ model: this.modelUri, embedding: true, pooling_type: 'mean', n_ctx: 2048, n_gpu_layers: 99 });
    this.dim = (await this.context.embedding('dimension probe')).embedding.length;
  }

  async unload(): Promise<void> {
    await this.context?.release();
    this.context = null;
  }

  isLoaded(): boolean {
    return this.context !== null;
  }

  async embed(texts: string[], kind: 'query' | 'document'): Promise<Float32Array[]> {
    await this.load();
    if (!this.context) throw new Error('embedder_not_loaded');
    // Prefissi previsti dalla scheda di EmbeddingGemma: da confermare sul modello effettivamente scelto.
    const prefix = kind === 'query' ? 'task: search result | query: ' : 'title: none | text: ';
    const vectors: Float32Array[] = [];
    for (const text of texts) {
      const result = await this.context.embedding(prefix + text);
      vectors.push(l2normalize(Float32Array.from(result.embedding)));
    }
    return vectors;
  }
}

const INPUT_SIZE = 224;
// Media e deviazione standard di CLIP: BioCLIP 2 usa la stessa normalizzazione (da confermare sull'export ONNX).
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

/** Ritaglio centrale quadrato, ridimensionato a 224x224 e normalizzato in formato NCHW. */
export function preprocessForClip(image: RgbaImage): Float32Array {
  const side = Math.min(image.width, image.height);
  const left = (image.width - side) / 2;
  const top = (image.height - side) / 2;
  const plane = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const sourceX = Math.min(image.width - 1, Math.floor(left + ((x + 0.5) * side) / INPUT_SIZE));
      const sourceY = Math.min(image.height - 1, Math.floor(top + ((y + 0.5) * side) / INPUT_SIZE));
      const offset = (sourceY * image.width + sourceX) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = (image.data[offset + channel] ?? 0) / 255;
        tensor[channel * plane + y * INPUT_SIZE + x] = (value - (MEAN[channel] ?? 0)) / (STD[channel] ?? 1);
      }
    }
  }
  return tensor;
}

/** Encoder visivo esportato in ONNX (ipotesi: BioCLIP 2) tramite ONNX Runtime. */
export class OnnxVisionEmbedder implements VisionEmbedder {
  private session: InferenceSession | null = null;
  dim = 0;

  constructor(
    readonly id: string,
    private readonly modelPath: string,
    readonly relevanceThreshold: number,
  ) {}

  async load(): Promise<void> {
    this.session ??= await InferenceSession.create(this.modelPath);
  }

  async unload(): Promise<void> {
    await this.session?.release();
    this.session = null;
  }

  isLoaded(): boolean {
    return this.session !== null;
  }

  async embedImage(image: RgbaImage): Promise<Float32Array> {
    await this.load();
    const session = this.session;
    const inputName = session?.inputNames[0];
    const outputName = session?.outputNames[0];
    if (!session || !inputName || !outputName) throw new Error('vision_not_loaded');
    const input = new Tensor('float32', preprocessForClip(image), [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const output = (await session.run({ [inputName]: input }))[outputName];
    if (!output) throw new Error('vision_no_output');
    const vector = l2normalize(Float32Array.from(output.data as Float32Array));
    this.dim = vector.length;
    return vector;
  }
}
