/**
 * LLM provider interface. See the architecture notes "Provider interfaces".
 *
 * Keep this stable — chat (Phase 5) and streaming (Phase 7) depend on it.
 */

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMCompleteArgs {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
}

export interface LLMProvider {
  /**
   * Identifies the concrete implementation ('mock' | 'anthropic'). Additive
   * extension over the architecture notes: used for the structured-event logging
   * called for there ("latency per stage") and so the Phase 3 smoke output can
   * prove which impl ran. Intentional.
   */
  readonly name: string;

  /** Non-streaming completion. Returns the model's raw text. */
  complete(args: LLMCompleteArgs): Promise<string>;

  /**
   * Streaming completion — yields text deltas. OPTIONAL and intentionally left
   * unimplemented until Phase 7 (streaming). Marking it optional (vs. required
   * in the docs sketch) keeps the mock/real providers compilable now without a
   * placeholder that could be called by accident.
   */
  stream?(args: LLMCompleteArgs): AsyncIterable<string>;
}
