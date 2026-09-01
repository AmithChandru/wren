/**
 * character/visemes.ts — the viseme table, char->viseme mapping, the parametric
 * mouth-path builder, and small math helpers. Renderer-agnostic, browser-safe.
 *
 * The viseme
 * INDICES are a contract shared with the Rive .riv asset — do not renumber them.
 */
import type { VisemeShape } from "./types.js";

/**
 * The ten-state viseme set — index IS the contract shared with the Rive .riv asset
 * (the lip-sync accuracy spec §4.1). Matches the de facto Rive community
 * convention, so marketplace/commissioned assets are drop-in compatible.
 *
 * DO NOT RENUMBER. Changed once, deliberately, on 2026-08-17 from a bespoke
 * 7-state set — an asset built to this contract and driven by the old indices
 * showed a wide-open mouth on every P/B/M, because old index 2 was `AH`.
 *
 * The open/wide/round triples are a first pass derived from §4.1's shape
 * descriptions; they are the tuning surface for the accuracy track's eval
 * harness, unlike the indices, which are frozen.
 */
export const VISEMES: readonly VisemeShape[] = [
  { open: 0.04, wide: 0.5, round: 0.3 }, // 0 SIL — neutral rest, closed relaxed
  { open: 0.7, wide: 0.85, round: 0.05 }, // 1 AI  — open, spread, unrounded
  { open: 0.0, wide: 0.55, round: 0.2 }, // 2 PBM — lips fully pressed together
  { open: 0.14, wide: 0.6, round: 0.1 }, // 3 FV  — top teeth on lower lip
  { open: 0.3, wide: 0.62, round: 0.15 }, // 4 TDN — lips parted, teeth near-together
  { open: 0.22, wide: 0.15, round: 1.0 }, // 5 UU  — tight round, small aperture
  { open: 0.3, wide: 0.25, round: 0.85 }, // 6 SH  — protruded, forward-rounded
  { open: 0.5, wide: 0.55, round: 0.15 }, // 7 L   — tongue tip visible, mouth open
  { open: 0.62, wide: 0.22, round: 0.9 }, // 8 OO  — open round
  { open: 0.35, wide: 0.2, round: 0.8 }, // 9 WR  — rounded glide, slight protrusion
];

export const REST = 0;

/** Map a single character to a viseme index. */
/**
 * Map a single character to a viseme index — a grapheme APPROXIMATION of the
 * ARPAbet table in the lip-sync accuracy spec §4.2, which is the real
 * contract. Working per character cannot see digraphs (`sh`, `ch`, `th`) or
 * silent letters, so e.g. "psychology" still closes the lips on the silent `p`.
 * That inaccuracy is the whole reason the phoneme layer exists; this stays as
 * the fallback path (gate G8) once G2P lands.
 */
export function charToViseme(ch: string): number {
  const c = (ch || "").toLowerCase();
  if (c === " " || `,.;:!?\n\t"'`.includes(c)) return REST; // 0 SIL
  if (c === "a" || c === "e" || c === "i") return 1; // AI
  if (c === "m" || c === "b" || c === "p") return 2; // PBM
  if (c === "f" || c === "v") return 3; // FV
  if (c === "u") return 5; // UU
  if (c === "l") return 7; // L
  if (c === "o") return 8; // OO
  if (c === "j") return 6; // SH — /dʒ/
  if (c === "w" || c === "r") return 9; // WR
  return 4; // TDN — the remaining consonants
}

/**
 * Per-character viseme sequence for a reply.
 *
 * A single inter-word SPACE is not a pause. §4.2 reserves SIL for silence and inter-word
 * gaps of >=120ms; at the driver's cadence one space is ~77ms, so closing the mouth on
 * every space makes the character chew rather than speak — measured, it drove SIL to a
 * third of all frames. Spaces therefore HOLD the preceding shape, while real punctuation
 * still closes the mouth.
 */
export function buildVisemeSequence(text: string): number[] {
  const chars = [...text];
  const lower = chars.map((c) => c.toLowerCase());
  const seq = chars.map(charToViseme);
  const inDigraph = new Array<boolean>(chars.length).fill(false);

  // Digraphs — one sound spelled with two letters. Per-character mapping cannot see them,
  // and without this every `ph` reads as a plosive and every `sh`/`ch` as TDN, which is a
  // large share of ordinary tutor vocabulary ("photosynthesis", "chlorophyll", "which").
  for (let i = 0; i < chars.length - 1; i++) {
    const pair = lower[i]! + lower[i + 1]!;
    const v = pair === "sh" || pair === "ch" ? 6 : pair === "ph" ? 3 : pair === "th" ? 4 : -1;
    if (v >= 0) {
      seq[i] = v;
      seq[i + 1] = v;
      inDigraph[i] = true;
      inDigraph[i + 1] = true;
    }
  }

  // Coarticulation rule 1 (§4.3): /h/ has no mouth shape of its own — the mouth is already
  // forming the following sound. Inherit forward, unless the h belongs to a digraph above.
  for (let i = 0; i < chars.length; i++) {
    if (lower[i] === "h" && !inDigraph[i]) seq[i] = i + 1 < seq.length ? seq[i + 1]! : REST;
  }

  // A single inter-word space holds the preceding shape rather than closing the mouth.
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === " ") seq[i] = i > 0 ? seq[i - 1]! : REST;
  }
  return seq;
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
