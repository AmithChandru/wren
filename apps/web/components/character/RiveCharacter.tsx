"use client";
/**
 * RiveCharacter.tsx — the Rive renderer. Implements the SAME `CharacterRenderer`
 * contract as SvgCharacter, so the shared driver, the chat UI, and the backend are
 * unchanged; only the flag in Character.tsx picks between them.
 *
 * ASSET: public/character.riv — "Custom Talking Avatar: Real-Time Lip Sync for Your App"
 * by stvfunm, from the Rive Community marketplace, licensed CC BY 4.0.
 *   https://rive.app/marketplace/21097-39950-custom-talking-avatar-real-time-lip-sync-for-your-app/
 * CC BY REQUIRES VISIBLE ATTRIBUTION wherever this ships. See the credit in app/page.tsx.
 *
 * The asset does NOT satisfy the ideal contract in the renderer contract (a `main`
 * state machine with `mouthShape` / `expression` / `isTalking` / gaze inputs). Verified by
 * enumerating it with the Rive runtime, it exposes exactly one usable input:
 *
 *   artboard "Artboard" · state machine "State Machine 1" · number input "Number 1"
 *
 * Driving that input 0..23 produces 13 distinct MOUTH-ONLY poses (ids 0-12; 13+ clamp to
 * 12). The eyes and brows never move, which is why expression is a no-op here rather than
 * being welded into the mouth value.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { Alignment, Fit, Layout, useRive, useStateMachineInput } from "@rive-app/react-canvas";
import type { CharacterRenderer } from "@wren/shared/character";

const ARTBOARD = "Artboard";
const STATE_MACHINE = "State Machine 1";
const MOUTH_INPUT = "Number 1";

/**
 * Our 10-state viseme contract -> this asset's mouth ids, index by index.
 *
 * Assigned by MEASUREMENT, not by eye: each of the asset's 13 poses was rendered and its
 * mouth aperture measured in pixels (area of everything that is neither skin nor lip).
 * That gives an openness ladder, smallest to largest:
 *
 *   11(1331) 0(1438) 4(1464) 7(1475) 8/9(1682) 6(1807) 3(1930) 5(1950)
 *   12(2109) 10(2202) 2(2376) 1(4380)
 *
 * Ids 8 and 9 render identically, so 9 is redundant. Every viseme below gets its OWN pose;
 * only 4, 6 and 9 are unused. Indices follow the lip-sync accuracy spec §4.1.
 */
const VISEME_TO_MOUTH: readonly number[] = [
  0, //  0 SIL — closed, relaxed, faint teeth line
  1, //  1 AI  — the widest aperture the asset has, by a factor of ~2
  11, //  2 PBM — the MOST closed pose. Bilabial closure is the most-noticed lip-sync
  //           error, so it gets the tightest shape rather than sharing SIL's.
  7, //  3 FV  — near-closed with the teeth bar showing
  8, //  4 TDN — lips parted, teeth near-together
  3, //  5 UU  — small round aperture
  12, //  6 SH  — protruded, mid-open
  10, //  7 L   — open, tongue-height
  2, //  8 OO  — large rounded opening
  5, //  9 WR  — rounded glide, between UU and SH
];

/** Highest id this asset actually differentiates; anything above renders identically. */
const MAX_MOUTH_ID = 12;

/**
 * The one pose the character rests in — both before it has ever spoken and after a reply
 * finishes. It must be applied on mount as well as on stop: the state machine's own
 * default for this input is NOT id 0, so without the mount write the idle pose and the
 * post-speech pose are two visibly different closed mouths.
 */
const REST_MOUTH_ID = VISEME_TO_MOUTH[0]!;

/**
 * A second, also-closed pose used only as a stepping stone into REST.
 *
 * Rive state-machine transitions fire when an input CHANGES. A reply's final writes are
 * usually REST already, so writing REST again is a no-op and the machine can sit in
 * whatever pose it was last driven to — which is how the mouth ends up frozen open after
 * speech. Writing this value and then REST on the next frame guarantees a change event.
 * Id 4 is a near-closed pose (aperture 1464, third-tightest) and is deliberately left
 * out of the viseme map, so the intermediate frame is invisible and collides with nothing.
 */
const REST_NUDGE_ID = 4;

/**
 * The settle sequence: alternate NUDGE/REST on this cadence, ending on REST.
 *
 * One nudge-then-REST hop is not reliable — depending on where the state machine is in a
 * pose blend when it lands, the mouth can stop part-open. Repeating gives the machine
 * several change events to converge on, and both values are closed poses so the
 * intermediate frames are invisible.
 */
const REST_SETTLE_MS = 150;
const REST_SETTLE_STEPS = 4;

export const RiveCharacter = forwardRef<CharacterRenderer, { className?: string }>(
  function RiveCharacter({ className }, ref) {
    const { rive, RiveComponent } = useRive({
      src: "/character.riv",
      artboard: ARTBOARD,
      stateMachines: STATE_MACHINE,
      autoplay: true,
      // Fit.Cover fills the box instead of letterboxing, and anchoring CenterRight crops
      // from the LEFT — which is where the asset's baked-in demo strip lives. Doing this
      // through Rive's own layout keeps the character vertically centred; the CSS
      // scale/translate this replaced cropped from the centre and cut off his head.
      layout: new Layout({ fit: Fit.Cover, alignment: Alignment.CenterRight }),
    });

    const mouth = useStateMachineInput(rive, STATE_MACHINE, MOUTH_INPUT);

    const restRaf = useRef<number | null>(null);

    /** Drive the mouth back to REST, forcing transitions even if it is already REST. */
    const settleToRest = useCallback(() => {
      if (!mouth) return;
      if (restRaf.current !== null) clearInterval(restRaf.current);
      let step = 0;
      const tick = () => {
        if (!mouth) return;
        // Odd steps nudge, even steps rest — so the sequence always ENDS on REST.
        mouth.value = step % 2 === 0 ? REST_NUDGE_ID : REST_MOUTH_ID;
        step += 1;
        if (step > REST_SETTLE_STEPS && restRaf.current !== null) {
          clearInterval(restRaf.current);
          restRaf.current = null;
          mouth.value = REST_MOUTH_ID;
        }
      };
      tick();
      restRaf.current = window.setInterval(tick, REST_SETTLE_MS);
    }, [mouth]);

    useEffect(() => () => {
      if (restRaf.current !== null) clearInterval(restRaf.current);
    }, []);

    // Settle into the rest pose as soon as the input resolves, so idle and end-of-speech
    // are the same frame rather than two different defaults.
    useEffect(() => {
      settleToRest();
    }, [settleToRest]);

    useImperativeHandle(
      ref,
      () => ({
        setViseme: (v: number) => {
          if (!mouth) return;
          const id = VISEME_TO_MOUTH[v] ?? 0;
          mouth.value = Math.min(id, MAX_MOUTH_ID);
        },
        // This asset carries no expression or gaze inputs, and its mouth poses do not
        // encode a face state — so these are honest no-ops rather than silent guesses.
        // The transcript still shows the emotion label, so nothing is lost to the user.
        setExpression: () => {},
        setTalking: (t: boolean) => {
          // No isTalking input either; return the mouth to rest when speech ends so the
          // character does not freeze mid-syllable. The driver also pushes viseme REST on
          // stop, so this is belt-and-braces for the case where only setTalking fires.
          if (!t) settleToRest();
        },
        setGaze: () => {},
      }),
      [mouth, settleToRest],
    );

    // The marketplace asset bakes the author's own demo UI into the artboard — a green
    // numbered viseme-picker strip down the left edge — plus an opaque dark backdrop.
    // Neither can be removed without editing the .riv, so crop them out at the view layer:
    // the wrapper clips, and the canvas is scaled and nudged right so only the head shows.
    return (
      <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
        <RiveComponent className="h-full w-full" />
      </div>
    );
  },
);
