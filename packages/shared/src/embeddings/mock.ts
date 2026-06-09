import type { EmbeddingsProvider } from './types.js';

/**
 * Deterministic, keyless embeddings. Same text →
 * same L2-normalized vector of `dimension` floats. Relevance is approximate but
 * the ingestion/retrieval pipeline is exercised end to end with no API key.
 *
 * `dimension` defaults to 1536 (OpenAI text-embedding-3-small / the Chunk
 * vector(1536) column). Override with EMBEDDINGS_DIM only alongside the column.
 */
export class MockEmbeddings implements EmbeddingsProvider {
  readonly name = 'mock';
  readonly dimension = Number(process.env.EMBEDDINGS_DIM ?? 1536);

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      let seed = [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const v = Array.from({ length: this.dimension }, () => {
        seed = (1103515245 * seed + 12345) & 0x7fffffff;
        return seed / 0x7fffffff - 0.5;
      });
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  }
}
