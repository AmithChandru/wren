/**
 * @wren/shared/character — renderer-agnostic lip-sync + expression core.
 *
 * Browser-safe (no node-only code, no `window`/`document`/`requestAnimationFrame`).
 * Exposed via the `./character` subpath export in packages/shared/package.json.
 *
 * Both renderers (SVG today, Rive in Phase 8) implement `CharacterRenderer`; the
 * shared `createSpeechDriver` drives any of them.
 */

// Types + the renderer contract.
export type {
  Expression,
  VisemeShape,
  ExpressionPreset,
  CharacterRenderer,
  VisemeSink,
} from "./types.js";

// Viseme table, mapping, mouth-path builder, math helpers.
export {
  VISEMES,
  REST,
  charToViseme,
  buildVisemeSequence,
  lerp,
  clamp,
  mouthPath,
} from "./visemes.js";

// Expression presets.
export { EXPRESSIONS } from "./expressions.js";

// The timer-driven speech driver.
export { createSpeechDriver } from "./driver.js";
export type { SpeechDriverOptions } from "./driver.js";
