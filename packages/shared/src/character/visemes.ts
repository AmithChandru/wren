/**
 * character/visemes.ts — the viseme table, char->viseme mapping, the parametric
 * mouth-path builder, and small math helpers. Renderer-agnostic, browser-safe.
 *
 * The viseme
 * INDICES are a contract shared with the Rive .riv asset — do not renumber them.
 */
import type { VisemeShape } from "./types.js";

/** Index = the contract shared with the Rive .riv asset. Do not renumber. */
export const VISEMES: readonly VisemeShape[] = [
  { open: 0.04, wide: 0.5, round: 0.3 }, // 0 REST
  { open: 0.0, wide: 0.55, round: 0.2 }, // 1 MBP  (m b p)
  { open: 0.95, wide: 0.48, round: 0.35 }, // 2 AH  (a)
  { open: 0.34, wide: 1.0, round: 0.0 }, // 3 EE   (e i)
  { open: 0.55, wide: 0.18, round: 1.0 }, // 4 OO   (o u w)
  { open: 0.14, wide: 0.6, round: 0.1 }, // 5 FV   (f v)
  { open: 0.5, wide: 0.62, round: 0.25 }, // 6 MID  (other consonants)
];

export const REST = 0;

/** Map a single character to a viseme index. */
export function charToViseme(ch: string): number {
  const c = (ch || "").toLowerCase();
  if (c === " " || `,.;:!?\n\t"'`.includes(c)) return REST;
  if (c === "a") return 2;
  if (c === "e" || c === "i") return 3;
  if (c === "o" || c === "u" || c === "w") return 4;
  if (c === "m" || c === "b" || c === "p") return 1;
  if (c === "f" || c === "v") return 5;
  return 6;
}

/** Per-character viseme sequence for a reply. */
export function buildVisemeSequence(text: string): number[] {
  return [...text].map(charToViseme);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Build the parametric mouth path. `open/wide/round` come from the current viseme,
 * `smile` from the current expression. Center is (cx, cy).
 */
export function mouthPath(
  open: number,
  wide: number,
  round: number,
  smile: number,
  cx = 180,
  cy = 232,
): string {
  const half = 34 * (0.62 + 0.55 * wide) * (1 - 0.42 * round);
  const openH = 30 * open * (0.85 + 0.4 * round);
  const corner = -8 * smile;
  const lx = cx - half;
  const rx = cx + half;
  const cornerY = cy + corner;
  const topMidY = cy - (3 + open * 3) + corner * 0.35;
  const botMidY = cy + openH + 3 + corner * 0.1;
  return (
    `M ${lx.toFixed(1)} ${cornerY.toFixed(1)} ` +
    `Q ${cx} ${topMidY.toFixed(1)} ${rx.toFixed(1)} ${cornerY.toFixed(1)} ` +
    `Q ${cx} ${botMidY.toFixed(1)} ${lx.toFixed(1)} ${cornerY.toFixed(1)} Z`
  );
}
