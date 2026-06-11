/**
 * Chat API contracts (browser-safe). These are the request/response shapes for
 * POST /api/chat — see the architecture notes "API request/response shapes".
 *
 * Pure types only: no node-only code, so they're safe to re-export from the main
 * `@wren/shared` barrel. The Phase 6 frontend imports `ChatRequest`,
 * `ChatResponse`, and `Emotion` from here and POSTs to /api/chat.
 */

/**
 * The five expressions the character can show. The LLM must begin its reply with
 * exactly one of these as a `[tag]`; the backend parses + strips it (see
 * apps/api/src/prompt/persona.ts) and the frontend maps it to an expression.
 *
 * Single source of truth: the runtime list and the `Emotion` type are derived from
 * the SAME `EMOTIONS` array, so they can never drift apart in either direction.
 */
export const EMOTIONS = ['neutral', 'happy', 'thinking', 'curious', 'encouraging'] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** A timed mouth shape. `t` is seconds from audio start; `viseme` is a viseme id. */
export interface VisemeEvent {
  t: number;
  viseme: number;
}

/**
 * Synthesized speech for a reply. Either inline `base64` (Phase 5 non-streaming)
 * or a `url` to fetch it; `mime` describes the audio container/codec.
 */
export interface ChatAudio {
  mime: string;
  base64?: string;
  url?: string;
}

/** POST /api/chat request body. */
export interface ChatRequest {
  tenantId: string;
  sessionId?: string;
  message: string;
}

/** POST /api/chat response body. */
export interface ChatResponse {
  sessionId: string;
  emotion: Emotion;
  text: string;
  /** Omitted when TTS is unavailable (text-only degrade) — see error handling. */
  audio?: ChatAudio;
  /** Optional precomputed viseme timing; otherwise the client derives from text. */
  visemes?: VisemeEvent[];
}
