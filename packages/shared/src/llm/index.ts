import { AnthropicLLM } from './anthropic.js';
import { MockLLM } from './mock.js';
import type { LLMProvider } from './types.js';

export type { LLMMessage, LLMCompleteArgs, LLMProvider } from './types.js';
export { MockLLM } from './mock.js';
export { AnthropicLLM } from './anthropic.js';

/**
 * Pick the LLM impl from env, mock-first. Never throws when a key is absent —
 * only a real provider that is both selected AND used needs a key. If a provider
 * is explicitly selected but its key is missing, warn and fall back to mock.
 */
export function getLLM(): LLMProvider {
  if (process.env.LLM_PROVIDER === 'anthropic') {
    if (process.env.ANTHROPIC_API_KEY) return new AnthropicLLM();
    console.warn('[llm] LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing; using mock.');
  }
  return new MockLLM();
}
