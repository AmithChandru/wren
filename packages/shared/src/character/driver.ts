/**
 * character/driver.ts — the timer-driven, renderer-agnostic speech driver.
 *
 * Browser-safe:
 * uses `performance.now()` + `setTimeout` (global in node + browser), never `window`,
 * `document`, or `requestAnimationFrame` (those live in the renderer).
 *
 * NON-NEGOTIABLE rules: drive the mouth on a timer so the face animates
 * even if audio is blocked; snap to real timestamps via `syncTo()` when available; always
 * return to REST on `stop()` or the maxMs backstop.
 */
import { buildVisemeSequence, clamp, REST } from "./visemes.js";
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

  const tick = () => {
    if (!running) return;
    const elapsed = opts.getElapsedMs ? opts.getElapsedMs() : performance.now() - started;
    pointer = Math.max(pointer, Math.floor((elapsed / 1000) * cadence));
    sink.setViseme(seq[clamp(pointer, 0, total - 1)] ?? REST);
    timer = setTimeout(tick, 70 + Math.random() * 30);
  };

  return {
    /** Snap the pointer to a known character index (from TTS/boundary timestamps). */
    syncTo(charIndex: number) {
      if (Number.isFinite(charIndex)) pointer = Math.max(pointer, Math.floor(charIndex));
    },
    start(done?: () => void) {
      onDone = done ?? null;
      running = true;
      started = performance.now();
      sink.setTalking(true);
      tick();
      backstop = setTimeout(() => this.stop(), opts.maxMs ?? estMs * 1.5 + 1500);
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
