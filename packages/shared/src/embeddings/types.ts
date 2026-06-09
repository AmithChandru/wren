/**
 * Embeddings provider interface. See the architecture notes "Provider interfaces".
 *
 * `dimension` MUST match the Chunk `vector(N)` column.
 */

export interface EmbeddingsProvider {
  /**
   * Identifies the concrete implementation ('mock' | 'openai' | 'voyage').
   * Additive extension for observability / smoke proof — see the note in
   * llm/types.ts. Intentional.
   */
  readonly name: string;

  /** Length of every returned vector. Must equal the `vector(N)` column. */
  readonly dimension: number;

  /** Embed a batch of texts; result[i] corresponds to texts[i]. */
  embed(texts: string[]): Promise<number[][]>;
}
