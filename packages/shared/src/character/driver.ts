/**
 * character/driver.ts — the timer-driven, renderer-agnostic speech driver.
 *
 * One deliberate
 * deviation, marked inline: the reference clamps the viseme pointer to the last character,
 * which leaves the mouth frozen in that shape after the words run out. We emit REST
 * instead. Browser-safe:
 * uses `performance.now()` + `setTimeout` (global in node + browser), never `window`,
 * `document`, or `requestAnimationFrame` (those live in the renderer).
 *
 * NON-NEGOTIABLE rules: drive the mouth on a timer so the face animates
 * even if audio is blocked; snap to real timestamps via `syncTo()` when available; always
 * return to REST on `stop()` or the maxMs backstop.
 */
import { buildVisemeSequence, clamp, REST } from "./visemes.js";
import type { TimedViseme } from "./timeline.js";
import type { VisemeSink } from "./types.js";

export interface SpeechDriverOptions {
  /** Approx spoken characters per second. */
  cadence?: number;
  /**
   * Optional clock in ms since speech start. Provide audioEl.currentTime*1000 to lock the
   * mouth to real audio. If omitted, the driver uses its own wall clock.
   */
  getElapsedMs?: () => number;
  /** Optional max duration backstop (ms) so the turn always ends. */
  maxMs?: number;
  /**
   * Real viseme timeline from the TTS provider's measured word timings. When present the
   * mouth follows THIS against the audio clock rather than the assumed `cadence`, which
   * is the difference between lip-sync that tracks the voice and lip-sync that drifts.
   * Pair it with `getElapsedMs` reading `audioEl.currentTime`.
   */
  timeline?: readonly TimedViseme[];
}

/**
 * Timer-driven lip-sync. Advances a character pointer by elapsed*cadence and pushes the
 * matching viseme to the sink. Call `syncTo(charIndex)` from a TTS/word-boundary callback
 * to snap to the true position. Always ends via `stop()` or the maxMs backstop.
 */
export function createSpeechDriver(sink: VisemeSink, text: string, opts: SpeechDriverOptions = {}) {
  const cadence = opts.cadence ?? 13;
  const seq = buildVisemeSequence(text);
  const total = Math.max(seq.length, 1);
  const estMs = clamp((total / cadence) * 1000, 1200, 20000);
  let pointer = 0;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let backstop: ReturnType<typeof setTimeout> | null = null;
  let onDone: (() => void) | null = null;
  let running = false;

  const timeline = opts.timeline;
  const hasTimeline = !!timeline && timeline.length > 0;
  /** Index into `timeline`; monotonic, so this is a walk rather than a search per frame. */
  let cue = 0;

  const tick = () => {
    if (!running) return;
    const elapsed = opts.getElapsedMs ? opts.getElapsedMs() : performance.now() - started;

    if (hasTimeline) {
      // Follow the measured timeline against the audio clock. Advance while the NEXT cue
      // is already due, so a stalled or seeking audio element cannot desynchronise us.
      while (cue + 1 < timeline.length && timeline[cue + 1]!.t * 1000 <= elapsed) cue += 1;
      sink.setViseme(timeline[cue]!.viseme);
    } else {
      pointer = Math.max(pointer, Math.floor((elapsed / 1000) * cadence));
      // Past the end of the text the mouth must CLOSE, not hold the final character's
      // shape. Clamping to `total - 1` freezes the face
      // open whenever a reply ends on a vowel, and it stays open for the rest of the audio
      // because nothing else writes a viseme until stop().
      sink.setViseme(pointer >= total ? REST : (seq[pointer] ?? REST));
    }

    // A timeline carries real onsets, so sample faster to land on them; the estimated
    // path keeps the reference's jittered ~85ms so it does not look mechanical.
    timer = setTimeout(tick, hasTimeline ? 33 : 70 + Math.random() * 30);
  };

  return {
    /** Snap the pointer to a known character index (from TTS/boundary timestamps). */
    syncTo(charIndex: number) {
      // No-op in timeline mode: the timeline IS the truth, and nudging a character
      // pointer would fight it.
      if (hasTimeline) return;
      if (Number.isFinite(charIndex)) pointer = Math.max(pointer, Math.floor(charIndex));
    },
    start(done?: () => void) {
      onDone = done ?? null;
      running = true;
      started = performance.now();
      sink.setTalking(true);
      tick();
      // With a timeline the true end is known, so the anti-hang net can be tight and
      // honest instead of a guess scaled off the text length.
      const timelineMs = hasTimeline ? timeline[timeline.length - 1]!.t * 1000 + 1500 : null;
      backstop = setTimeout(() => this.stop(), opts.maxMs ?? timelineMs ?? estMs * 1.5 + 1500);
    },
    stop() {
      if (!running) return;
      running = false;
      if (timer) clearTimeout(timer);
      if (backstop) clearTimeout(backstop);
      sink.setViseme(REST);
      sink.setTalking(false);
      onDone?.();
    },
  };
}
