/**
 * @wren/shared — browser-safe barrel of cross-workspace types.
 *
 * IMPORTANT: keep this import path free of node-only code (the Anthropic/OpenAI
 * SDKs, `process`, `fetch`, `atob`). The LLM/embeddings/TTS providers and their
 * factories live behind the `@wren/shared/providers` subpath export so the web
 * bundle never pulls them in. See packages/shared/src/providers.ts.
 *
 * Provider *type* contracts are safe to re-export here (types erase at build).
 * The character core lives behind the dedicated `@wren/shared/character` subpath
 * (parallel to `@wren/shared/providers`), not on this general barrel.
 */

export const SHARED_OK = true;

export type { LLMMessage, LLMCompleteArgs, LLMProvider } from './llm/types.js';
export type { EmbeddingsProvider } from './embeddings/types.js';
export type { TTSWord, TTSResult, TTSChunk, TTSProvider } from './tts/types.js';

// Chat API contracts (POST /api/chat). Pure types + the EMOTIONS const (a plain
// string array — browser-safe, no node code).
export { EMOTIONS } from './chat/types.js';
export type {
  Emotion,
  VisemeEvent,
  ChatAudio,
  ChatRequest,
  ChatResponse,
} from './chat/types.js';
