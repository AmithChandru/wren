/**
 * TTS provider interface. See the architecture notes "Provider interfaces".
 *
 * `words` timestamps (seconds) tighten lip-sync — the speech driver snaps the
 * mouth to the true audio position instead of estimating.
 */

export interface TTSWord {
  word: string;
  start: number; // seconds from audio start
  end: number; // seconds from audio start
}

export interface TTSResult {
  mime: string;
  bytes: Uint8Array;
  words?: TTSWord[];
}

export interface TTSChunk {
  bytes: Uint8Array;
  words?: TTSWord[];
}

export interface TTSProvider {
  /**
   * Identifies the concrete implementation ('mock' | 'elevenlabs'). Additive
   * extension for observability / smoke proof — see the note in llm/types.ts.
   * Intentional.
   */
  readonly name: string;

  /** Non-streaming synthesis. Returns audio bytes + optional word timings. */
  synthesize(text: string, voiceId?: string): Promise<TTSResult>;

  /**
   * Streaming synthesis — yields audio chunks. OPTIONAL; implemented in Phase 7.
   * Left out now intentionally (see llm/types.ts stream note).
   */
  stream?(text: string, voiceId?: string): AsyncIterable<TTSChunk>;
}
