"use client";
/**
 * Character.tsx — picks the renderer from the CHARACTER_RENDERER env var and forwards
 * the imperative ref through. The ref type is the shared `CharacterRenderer` contract, so
 * the caller (Chat) drives whichever renderer is active without knowing which one it is.
 *
 * Selected by NEXT_PUBLIC_CHARACTER_RENDERER: 'svg' (default) or 'rive'.
 */
import { forwardRef } from "react";
import type { CharacterRenderer } from "@wren/shared/character";
import { SvgCharacter } from "./SvgCharacter";
import { RiveCharacter } from "./RiveCharacter";

const RENDERER = process.env.NEXT_PUBLIC_CHARACTER_RENDERER ?? "svg";

// Be loud rather than silently painting the wrong character. Module scope, so this warns
// once per load instead of on every render.
if (RENDERER !== "svg" && RENDERER !== "rive") {
  console.warn(
    `[wren] NEXT_PUBLIC_CHARACTER_RENDERER="${RENDERER}" is not a known renderer ` +
      `(expected "svg" or "rive") — falling back to the SVG renderer.`,
  );
}

export const Character = forwardRef<CharacterRenderer, { className?: string }>(
  function Character({ className }, ref) {
    // Both renderers implement the same CharacterRenderer handle, so this branch is the
    // only place that knows which one is active.
    if (RENDERER === "rive") {
      return <RiveCharacter ref={ref} className={className} />;
    }
    return <SvgCharacter ref={ref} className={className} />;
  },
);
