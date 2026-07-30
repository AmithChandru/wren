/**
 * character/types.ts — renderer-agnostic character contracts.
 *
 * Browser-safe: pure types + the CharacterRenderer interface from
 * the character-system design notes. No React, no DOM, no node-only code.
 *
 * `Expression` is intentionally NOT a separate union — it is the SAME 5 values as
 * the shared chat `Emotion` (the LLM emotion tags map one-to-one to expressions).
 */
import type { Emotion } from "../chat/types.js";

/** A character expression. Identical to the chat `Emotion` (single source of truth). */
export type Expression = Emotion;

/** The shape parameters that define a single mouth viseme. */
export interface VisemeShape {
  open: number;
  wide: number;
  round: number;
}

/** Tunable target values for a facial expression, eased toward each frame by the renderer. */
export interface ExpressionPreset {
  brow: number; // vertical brow offset (px-ish, negative = raised)
  tilt: number; // inner-brow rotation (deg)
  eye: number; // eye openness multiplier
  gx: number; // gaze x offset
  gy: number; // gaze y offset
  smile: number; // 0..1 mouth-corner lift
  cheek: number; // 0..1 blush opacity
  head: number; // head tilt (deg)
}

/**
 * A renderer paints the current viseme + expression. Implemented by SVG (Phase 6)
 * and Rive (Phase 8). The shared driver controls a renderer through this surface and
 * does not know which implementation it is driving.
 */
export interface CharacterRenderer {
  setViseme(viseme: number): void; // 0..N mouth-shape index (see VISEMES)
  setExpression(expr: Expression): void;
  setTalking(talking: boolean): void;
  setGaze?(x: number, y: number): void; // optional, -1..1 eye direction
}

/** Minimal renderer surface the speech driver controls (subset of CharacterRenderer). */
export interface VisemeSink {
  setViseme(v: number): void;
  setTalking(t: boolean): void;
}
