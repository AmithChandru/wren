"use client";
/**
 * Character.tsx — picks the renderer from the CHARACTER_RENDERER env var and forwards
 * the imperative ref through. The ref type is the shared `CharacterRenderer` contract, so
 * the caller (Chat) drives whichever renderer is active without knowing which one it is.
 *
 * Selected by NEXT_PUBLIC_CHARACTER_RENDERER (default 'svg'). Phase 6 ships only 'svg'.
 */
import { forwardRef } from "react";
import type { CharacterRenderer } from "@wren/shared/character";
import { SvgCharacter } from "./SvgCharacter";

const RENDERER = process.env.NEXT_PUBLIC_CHARACTER_RENDERER ?? "svg";

// Be loud rather than silently painting the wrong character. Module scope, so this warns
// once per load instead of on every render.
if (RENDERER !== "svg") {
  console.warn(
    `[wren] NEXT_PUBLIC_CHARACTER_RENDERER="${RENDERER}" is not available yet ` +
      `(the Rive renderer lands in Phase 8) — falling back to the SVG renderer.`,
  );
}

export const Character = forwardRef<CharacterRenderer, { className?: string }>(
  function Character({ className }, ref) {
    // Phase 8: if RENDERER === 'rive' -> <RiveCharacter ref={ref} className={className} />
    // (RiveCharacter requires a conforming .riv asset and the renderer contract; it
    // does not exist yet. It will implement the SAME CharacterRenderer interface, so this
    // is the only line that changes.)
    return <SvgCharacter ref={ref} className={className} />;
  },
);
