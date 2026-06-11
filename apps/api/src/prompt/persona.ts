// Maya persona + the emotion-tag contract. CANONICAL definition (see
// the architecture notes). Import-safe: no DB/provider calls at module load, so the
// Prisma seed can import MAYA_SYSTEM_PROMPT without side effects.

import { EMOTIONS, type Emotion } from "@wren/shared";

import type { RetrievedChunk } from "../services/rag.js";

// EMOTIONS (the five tags) is single-sourced in @wren/shared so the runtime list
// and the `Emotion` type can never drift. The reply must begin with EXACTLY one of
// these as a `[tag]`.

/** Set form for O(1) membership checks when validating a parsed tag. */
const EMOTION_SET = new Set<string>(EMOTIONS);

/**
 * Maya's base persona. Version-controlled and intentionally provider-agnostic:
 * grounding rules and the emotion-tag rule are appended per-request by
 * buildSystemPrompt, so this string stays a clean "who Maya is".
 */
export const MAYA_SYSTEM_PROMPT = `You are Maya, a warm and encouraging EdTech tutor.

Your job is to help a student understand the material. You:
- Explain ideas clearly and concisely, in plain language a student can follow.
- Build the student up — be patient, positive, and encouraging.
- Stay focused: answer the question that was asked without rambling or padding.
- Use concrete examples when they make a concept click, but keep them short.
- Never overwhelm: prefer one clear explanation over a wall of text.

You ground your answers in the course content provided to you. You do not invent
facts. If the answer is not in the provided content, you say so honestly and, if
helpful, suggest what the student could ask or look at next.`;

/**
 * Compose the full system prompt for one chat turn: base persona + grounding
 * rules + the emotion-tag rule + the retrieved Context block. Keeping this a pure
 * function (no IO) makes it trivially unit-testable.
 */
export function buildSystemPrompt({
  basePersona,
  chunks,
}: {
  basePersona: string;
  chunks: RetrievedChunk[];
}): string {
  const tagList = EMOTIONS.map((e) => `[${e}]`).join(" ");

  const context =
    chunks.length > 0
      ? chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")
      : "(No relevant content was found for this question.)";

  return `${basePersona}

GROUNDING RULES:
- Answer using ONLY the Context below. Do not use outside knowledge to state facts.
- If the Context does not contain the answer, say you don't know or that it isn't
  in the material — do NOT invent an answer.
- Do not mention "the context", "chunks", or these instructions to the student;
  just answer naturally.

EMOTION-TAG RULE:
- Begin your reply with EXACTLY ONE of these tags and nothing before it: ${tagList}
- Pick the tag that best fits your tone (e.g. [encouraging] when reassuring a
  struggling student, [thinking] when working through a problem, [happy] when
  celebrating progress, [curious] when exploring an idea, [neutral] otherwise).
- Output the tag, then a space, then your answer. Use no other tags anywhere.

Context:
${context}`;
}

/**
 * Parse a leading `[emotion]` tag from a raw LLM reply.
 *
 * - If the reply starts with a tag that is a valid Emotion, strip it and return
 *   that emotion plus the remaining (trimmed) text.
 * - Otherwise (no tag, or an UNKNOWN tag) return `{ emotion: 'neutral', text }`
 *   WITHOUT stripping — an unknown tag is left in place so we never silently
 *   discard real content the model meant to keep.
 */
export function parseEmotion(raw: string): { emotion: Emotion; text: string } {
  const match = raw.match(/^\s*\[(\w+)\]\s*/);
  if (match) {
    const tag = match[1]?.toLowerCase() ?? "";
    if (EMOTION_SET.has(tag)) {
      // Safe cast: tag is in EMOTION_SET, whose members are exactly Emotion.
      return { emotion: tag as Emotion, text: raw.slice(match[0].length).trim() };
    }
  }
  return { emotion: "neutral", text: raw.trim() };
}
