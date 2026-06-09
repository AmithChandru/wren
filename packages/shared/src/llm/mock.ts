import type { LLMCompleteArgs, LLMProvider } from './types.js';

/** Phase 5 emotion contract — the reply MUST begin with one of these tags. */
const EMOTIONS = ['neutral', 'happy', 'thinking', 'curious', 'encouraging'] as const;

/**
 * Deterministic, keyless LLM. No network, no key. Produces a reply that begins
 * with a valid `[emotion]` tag (Phase 5 contract) followed by a short, friendly
 * tutor-style answer that references the user's last message. The text is clearly
 * marked as a mock so it can't be mistaken for a real model answer.
 */
export class MockLLM implements LLMProvider {
  readonly name = 'mock';

  async complete(args: LLMCompleteArgs): Promise<string> {
    const lastUser = [...args.messages].reverse().find((m) => m.role === 'user');
    const question = (lastUser?.content ?? '').trim();

    // Deterministic emotion pick derived from the question (same in → same out).
    const seed = [...question].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    // `?? 'neutral'` makes the always-in-range index explicit at the type level so
    // the reply can never emit a `[undefined]` tag and break the Phase 5 parser.
    const emotion = EMOTIONS[seed % EMOTIONS.length] ?? 'neutral';

    const quoted = question.length > 0 ? `“${truncate(question, 120)}”` : 'your question';

    return (
      `[${emotion}] (mock reply) Great question about ${quoted}! ` +
      `I'm Maya, your tutor. In a real deployment I'd ground this answer in your ` +
      `course content, but this is a deterministic mock response so the pipeline ` +
      `runs without any API keys.`
    );
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
