import type { EmbeddingsProvider } from './types.js';

interface VoyageResponse {
  data: Array<{ embedding: number[] }>;
}

/** Validate the untrusted HTTP response shape before mapping it. */
function isVoyageResponse(v: unknown): v is VoyageResponse {
  if (typeof v !== 'object' || v === null) return false;
  const data = (v as { data?: unknown }).data;
  return (
    Array.isArray(data) &&
    data.every((d) => d != null && Array.isArray((d as { embedding?: unknown }).embedding))
  );
}

/**
 * Voyage-backed embeddings via global fetch (no SDK). Constructed by the factory
 * ONLY when EMBEDDINGS_PROVIDER === 'voyage' AND VOYAGE_API_KEY is present.
 *
 * IMPORTANT — dimension MUST match the Chunk `vector(N)` column. Voyage's default
 * dimension differs from 1536 (voyage-3-large is 1024-d by default), so switching
 * to Voyage requires changing the column to vector(N), setting EMBEDDINGS_DIM=N,
 * and re-indexing. A mismatch throws at insert time.
 */
export class VoyageEmbeddings implements EmbeddingsProvider {
  readonly name = 'voyage';
  readonly dimension = Number(process.env.EMBEDDINGS_DIM ?? 1024);
  private readonly model: string;

  constructor() {
    this.model = process.env.VOYAGE_MODEL ?? 'voyage-3-large';
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) throw new Error(`Voyage embeddings ${res.status}`);
    const json: unknown = await res.json();
    if (!isVoyageResponse(json)) {
      throw new Error('Voyage embeddings: unexpected response shape');
    }
    return json.data.map((d) => d.embedding);
  }
}
