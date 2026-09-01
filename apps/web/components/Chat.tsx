"use client";
/**
 * Chat.tsx — the text input + transcript that DRIVES the character.
 *
 * On submit (the required user gesture for audio):
 *   1. append the user's message;
 *   2. call postChat();
 *   3. set the expression from `emotion`, append Maya's text, and drive lip-sync via the
 *      shared createSpeechDriver. If audio.base64 is present, play it and snap the driver
 *      to the real audio clock on `timeupdate` (currentTime * 13 ≈ char index at 13 ch/s).
 *      Autoplay-blocked is fine — the wall-clock timer still animates the mouth and the
 *      driver's budget returns it to REST.
 *
 * Audio teardown is owned by `ended`/`error` alone, never by the mouth's time budget, so
 * a long reply can never be cut off mid-word.
 *
 * One in-flight turn at a time; the reply text is always shown (captions) so it works muted.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatResponse, Emotion } from "@wren/shared";
import { createSpeechDriver, type CharacterRenderer } from "@wren/shared/character";
import { postChat, base64ToBlobUrl } from "../lib/api";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

/** Characters spoken per second — must match the driver's default cadence (13). */
const CADENCE = 13;

/**
 * Upper bound (ms) on how long ONE turn's mouth may animate — the driver's anti-hang net.
 * We pass this explicitly because the driver's own default clamps its text estimate to
 * 20 s, which pinned the net at 31.5 s for every reply over ~260 chars. Derived from the
 * text with no ceiling, plus 50% headroom so a voice slower than CADENCE still finishes.
 */
function mouthBudgetMs(text: string): number {
  return (text.length / CADENCE) * 1000 * 1.5 + 1500;
}

interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
  emotion?: Emotion;
}

/** One in-flight spoken reply: its driver, optional audio element, and blob URL. */
interface Turn {
  driver: ReturnType<typeof createSpeechDriver>;
  audioEl?: HTMLAudioElement;
  url?: string;
  done: boolean;
}

interface ChatProps {
  character: React.RefObject<CharacterRenderer | null>;
}

export function Chat({ character }: ChatProps) {
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef<string | undefined>(undefined);
  /** The single in-flight spoken turn, so a new turn can supersede it cleanly. */
  const activeTurn = useRef<Turn | null>(null);

  /** Detach a turn's audio: pause it, revoke its URL, forget it. Leaves the mouth running. */
  const dropAudio = useCallback((turn: Turn) => {
    turn.audioEl?.pause();
    if (turn.url) URL.revokeObjectURL(turn.url);
    turn.audioEl = undefined;
    turn.url = undefined;
  }, []);

  /** Idempotently end a specific turn: stop its driver, drop its audio, clear the slot. */
  const teardown = useCallback(
    (turn: Turn) => {
      if (turn.done) return;
      turn.done = true;
      turn.driver.stop();
      dropAudio(turn);
      if (activeTurn.current === turn) activeTurn.current = null;
    },
    [dropAudio],
  );

  // Stop any in-flight speech (timers + audio + blob URL) if Chat unmounts.
  useEffect(
    () => () => {
      if (activeTurn.current) teardown(activeTurn.current);
    },
    [teardown],
  );

  /** Drive expression + lip-sync for one reply, superseding any in-flight turn. */
  function speak(reply: ChatResponse) {
    // Barge-in: tear down any still-speaking turn so two never overlap or leak.
    if (activeTurn.current) teardown(activeTurn.current);

    character.current?.setExpression(reply.emotion);

    // Decode the audio FIRST so the driver can read its clock. atob/Blob can throw on a
    // malformed payload, so on ANY failure we fall through to the timer-only (muted)
    // path — the mouth still animates.
    let audioEl: HTMLAudioElement | undefined;
    let url: string | undefined;
    if (reply.audio?.base64) {
      try {
        url = base64ToBlobUrl(reply.audio.base64, reply.audio.mime);
        audioEl = new Audio(url);
      } catch {
        url = undefined;
        audioEl = undefined;
      }
    }

    // Prefer the REAL timeline the backend measured from the TTS word timings, played
    // against the audio's own clock. Only fall back to the assumed cadence when the
    // provider reported no timings (the mock) or audio failed to decode — an estimated
    // rate drifts against real speech, which is what makes lip-sync look approximate.
    const timeline = audioEl && reply.visemes?.length ? reply.visemes : undefined;
    const el = audioEl;

    const driver = createSpeechDriver(
      {
        setViseme: (v) => character.current?.setViseme(v),
        setTalking: (t) => character.current?.setTalking(t),
      },
      reply.text,
      {
        // Cadence still matters for the fallback path and the syncTo conversion below.
        cadence: CADENCE,
        maxMs: mouthBudgetMs(reply.text),
        ...(timeline ? { timeline, getElapsedMs: () => (el ? el.currentTime * 1000 : 0) } : {}),
      },
    );
    const turn: Turn = { driver, done: false, audioEl, url };

    if (audioEl) {
      // Without a timeline, nudge the estimate forward from the real audio position.
      // With one, the driver reads currentTime every tick and syncTo is a no-op.
      if (!timeline) {
        audioEl.addEventListener("timeupdate", () => driver.syncTo(audioEl.currentTime * CADENCE));
      }
      audioEl.addEventListener("ended", () => teardown(turn));
      // A media error must NOT end the turn: drop the audio and let the timer-driven
      // driver carry on, which is the muted fallback this file's contract promises.
      audioEl.addEventListener("error", () => dropAudio(turn));
    }

    activeTurn.current = turn;
    driver.start(() => {
      // The mouth has finished (natural end or the budget above). If audio is still
      // playing, leave it alone — `ended` owns audio teardown, so the mouth can never
      // cut speech short. Otherwise the driver was this turn's only clock: end the turn.
      const el = turn.audioEl;
      if (el && !el.paused && !el.ended) return;
      teardown(turn);
    });
    // Autoplay may be blocked despite the user gesture (e.g. a sandboxed iframe). Fine:
    // the timer-driven driver still animates the mouth and the backstop returns it to REST.
    void turn.audioEl?.play().catch(() => {});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || pending) return;

    setError(null);
    setInput("");
    setTranscript((t) => [...t, { role: "user", text: message }]);
    setPending(true);

    try {
      const reply = await postChat({
        tenantId: TENANT_ID,
        sessionId: sessionId.current,
        message,
      });
      sessionId.current = reply.sessionId;
      setTranscript((t) => [
        ...t,
        { role: "assistant", text: reply.text, emotion: reply.emotion },
      ]);
      speak(reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div
        className="flex h-72 flex-col gap-3 overflow-y-auto rounded-2xl border border-amber-100 bg-white/70 p-4 shadow-sm"
        aria-live="polite"
      >
        {transcript.length === 0 && (
          <p className="m-auto text-center text-sm text-slate-400">
            Ask Maya a question to get started.
          </p>
        )}
        {transcript.map((entry, i) => (
          <div
            key={i}
            className={entry.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                entry.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-sm bg-teal-600 px-4 py-2 text-sm text-white"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-amber-50 px-4 py-2 text-sm text-slate-700"
              }
            >
              {entry.role === "assistant" && entry.emotion && (
                <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-amber-500">
                  Maya · {entry.emotion}
                </span>
              )}
              {entry.text}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-amber-50 px-4 py-2 text-sm italic text-slate-400">
              Maya is thinking…
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="How do plants make food?"
          className="flex-1 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
          disabled={pending}
          aria-label="Message Maya"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
