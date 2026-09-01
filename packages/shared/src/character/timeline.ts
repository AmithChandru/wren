/**
 * character/timeline.ts — turn TTS word timings into a real viseme timeline.
 *
 * Without this the mouth runs on an assumed constant cadence (13 chars/sec) that drifts
 * against the actual audio: real speech stretches, pauses and emphasises. ElevenLabs
 * already returns per-word timings, so the correct clock is available — this maps them
 * onto the viseme sequence.
 *
 * Word granularity, per the alignment notes: character counts and sound counts
 * do not line up ("knight" is 6 letters, 3 sounds), so distributing a whole utterance
 * proportionally puts onsets in the wrong place. Distributing WITHIN each word keeps every
 * word anchored to its own measured start and end.
 *
 * Browser-safe and renderer-agnostic, like the rest of this module.
 */
import { buildVisemeSequence, REST } from "./visemes.js";

/** A word with measured start/end in seconds. Structurally `TTSWord`, kept local so the
 *  browser-safe character module does not depend on the node-only provider barrel. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

/** A timed mouth shape. Structurally `VisemeEvent` from the chat contract. */
export interface TimedViseme {
  t: number;
  viseme: number;
}

/** §4.2 reserves SIL for silence and inter-word gaps of at least this long. */
const SILENCE_GAP_S = 0.12;

/**
 * Build a viseme timeline for `text` using measured `words`.
 *
 * Returns an empty array when there are no usable timings — callers should treat that as
 * "fall back to the estimated cadence" rather than "no mouth movement", so a TTS provider
 * that reports no timings (the mock) still animates.
 */
export function buildVisemeTimeline(text: string, words: readonly TimedWord[]): TimedViseme[] {
  if (!words.length) return [];

  const seq = buildVisemeSequence(text);
  const events: TimedViseme[] = [];
  let cursor = 0;
  let prevEnd = 0;

  const push = (t: number, viseme: number) => {
    const last = events[events.length - 1];
    // Collapse repeats: holding a shape needs one event, not one per character.
    if (last && last.viseme === viseme) return;
    events.push({ t: Math.max(0, t), viseme });
  };

  for (const w of words) {
    if (!w.word) continue;
    // Locate this word in the original text so the visemes we emit are the ones built
    // from the real characters (including digraph and coarticulation handling).
    const idx = text.indexOf(w.word, cursor);
    if (idx < 0) continue;

    // A real pause between words closes the mouth; a normal word boundary does not.
    if (w.start - prevEnd >= SILENCE_GAP_S) push(prevEnd, REST);

    const len = w.word.length;
    const dur = Math.max(w.end - w.start, 0.01);
    for (let i = 0; i < len; i++) {
      push(w.start + (i / len) * dur, seq[idx + i] ?? REST);
    }

    cursor = idx + len;
    prevEnd = Math.max(prevEnd, w.end);
  }

  // Always end closed, so the face settles even if the caller never calls stop().
  push(prevEnd, REST);
  return events;
}
