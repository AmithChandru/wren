import { MockEmbeddings } from './mock.js';
import { OpenAIEmbeddings } from './openai.js';
import type { EmbeddingsProvider } from './types.js';
import { VoyageEmbeddings } from './voyage.js';

export type { EmbeddingsProvider } from './types.js';
export { MockEmbeddings } from './mock.js';
export { OpenAIEmbeddings } from './openai.js';
export { VoyageEmbeddings } from './voyage.js';

/**
 * Pick the embeddings impl from env, mock-first. Never throws on a missing key;
 * if a provider is explicitly selected without its key, warn and fall back to mock.
 */
export function getEmbeddings(): EmbeddingsProvider {
  if (process.env.EMBEDDINGS_PROVIDER === 'openai') {
    if (process.env.OPENAI_API_KEY) return new OpenAIEmbeddings();
    console.warn('[embeddings] EMBEDDINGS_PROVIDER=openai but OPENAI_API_KEY is missing; using mock.');
  }
  if (process.env.EMBEDDINGS_PROVIDER === 'voyage') {
    if (process.env.VOYAGE_API_KEY) return new VoyageEmbeddings();
    console.warn('[embeddings] EMBEDDINGS_PROVIDER=voyage but VOYAGE_API_KEY is missing; using mock.');
  }
  return new MockEmbeddings();
}
