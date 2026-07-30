/**
 * character/expressions.ts — the five expression presets, one-to-one with the LLM
 * emotion tags. Each is a set of target values the renderer eases toward each frame.
 *
 * Browser-safe: pure data, no DOM.
 */
import type { Expression, ExpressionPreset } from "./types.js";

export const EXPRESSIONS: Record<Expression, ExpressionPreset> = {
  neutral: { brow: 0, tilt: 0, eye: 1.0, gx: 0, gy: 0, smile: 0.25, cheek: 0.12, head: 0 },
  happy: { brow: -3, tilt: 0, eye: 0.82, gx: 0, gy: 0, smile: 1.0, cheek: 0.75, head: -2 },
  thinking: { brow: -2, tilt: 9, eye: 0.96, gx: 6, gy: -7, smile: 0.1, cheek: 0.08, head: 3 },
  curious: { brow: -7, tilt: 0, eye: 1.12, gx: 0, gy: -2, smile: 0.45, cheek: 0.22, head: -1 },
  encouraging: { brow: -3, tilt: 0, eye: 0.9, gx: 0, gy: 0, smile: 0.85, cheek: 0.55, head: 0 },
};
