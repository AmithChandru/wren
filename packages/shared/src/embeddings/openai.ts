import OpenAI from 'openai';
import type { EmbeddingsProvider } from './types.js';

/**
 * OpenAI-backed embeddings. Constructed by the factory ONLY when
 * EMBEDDINGS_PROVIDER === 'openai' AND OPENAI_API_KEY is present.
 *
 * text-embedding-3-small is 1536-d, matching the Chunk vector(1536) column.
 * Model id is the phase default — confirm the current string at the OpenAI docs
 * before shipping a real key.
 */
export class OpenAIEmbeddings implements EmbeddingsProvider {
  readonly name = 'openai';
  readonly dimension = 1536;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_EMBEDDINGS_MODEL ?? 'text-embedding-3-small';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.client.embeddings.create({ model: this.model, input: texts });
    // The API does not guarantee `data` is in input order — `index` is authoritative.
    // Reorder so embeddings[i] always corresponds to texts[i]; otherwise RAG would
    // silently pair a chunk with the wrong vector.
    const out: number[][] = new Array<number[]>(texts.length);
    for (const d of res.data) out[d.index] = d.embedding;
    // Explicit loop (not .map, which skips sparse-array holes) so a missing index
    // is caught. noUncheckedIndexedAccess types out[i] as `number[] | undefined`.
    for (let i = 0; i < texts.length; i++) {
      if (out[i] === undefined) {
        throw new Error(`OpenAI embeddings: response missing an embedding for input ${i}`);
      }
    }
    return out;
  }
}
