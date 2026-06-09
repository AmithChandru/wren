/**
 * @wren/shared/providers — NODE-ONLY barrel for the LLM/embeddings/TTS providers
 * and their factories.
 *
 * This is intentionally NOT re-exported from the main `src/index.ts` barrel: it
 * pulls in node globals (`process`, `Buffer`/`atob`, `fetch`) and the Anthropic /
 * OpenAI SDKs. apps/web imports `@wren/shared` (browser-safe); apps/api and the
 * smoke script import `@wren/shared/providers`.
 */

export type { LLMMessage, LLMCompleteArgs, LLMProvider } from './llm/index.js';
export { getLLM, MockLLM, AnthropicLLM } from './llm/index.js';

export type { EmbeddingsProvider } from './embeddings/index.js';
export { getEmbeddings, MockEmbeddings, OpenAIEmbeddings, VoyageEmbeddings } from './embeddings/index.js';

export type { TTSWord, TTSResult, TTSChunk, TTSProvider } from './tts/index.js';
export { getTTS, MockTTS, ElevenLabsTTS, charsToWords } from './tts/index.js';
