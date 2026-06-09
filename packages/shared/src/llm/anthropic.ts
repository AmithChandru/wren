import Anthropic from '@anthropic-ai/sdk';
import type { LLMCompleteArgs, LLMProvider } from './types.js';

/**
 * Anthropic-backed LLM. Constructed lazily by the factory ONLY when
 * LLM_PROVIDER === 'anthropic' AND ANTHROPIC_API_KEY is present, so importing
 * this module never throws on a keyless machine.
 *
 * Model default is env-overridable. Model IDs move over time — the
 * default below is the one specified for this phase; confirm the current string
 * at the Anthropic models docs before shipping a real key.
 */
export class AnthropicLLM implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    // The factory guarantees the key exists; constructing the SDK is cheap.
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';
  }

  async complete(args: LLMCompleteArgs): Promise<string> {
    const maxTokens = args.maxTokens ?? Number(process.env.ANTHROPIC_MAX_TOKENS ?? 1024);

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: args.system,
      messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    // Concatenate the text blocks; ignore non-text blocks (tool use, etc.).
    return res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
  }
}
