"use client";
/**
 * page.tsx — local dev playground (Phase 6).
 *
 * Owns the character ref, lays out Maya above the chat, and wires them together. The
 * ref type is the shared CharacterRenderer contract; Chat drives it on each reply.
 *
 * The CC BY credit below is a LICENSE CONDITION of the Rive asset, not decoration —
 * it must stay visible wherever the rive renderer ships. See RiveCharacter.tsx.
 */
import type { CharacterRenderer } from "@wren/shared/character";
import { useRef } from "react";
import { Character } from "../components/character/Character";
import { Chat } from "../components/Chat";

export default function Home() {
  const characterRef = useRef<CharacterRenderer>(null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-amber-50 to-teal-50 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Maya</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ask a question. Maya answers, speaks, and lip-syncs in real time.
        </p>
      </header>

      {/* Deliberately portrait (w < h): the Rive asset is a 500x500 artboard whose left
          ~11% is the author's baked-in demo strip. Fit.Cover fills the height and crops
          the excess width, and the renderer anchors CenterRight so the crop lands on the
          left. A square box would crop nothing. Harmless for the SVG renderer. */}
      <Character ref={characterRef} className="h-72 w-64 drop-shadow-sm" />

      <Chat character={characterRef} />

      {process.env.NEXT_PUBLIC_CHARACTER_RENDERER === "rive" && (
        <p className="text-center text-[11px] text-slate-400">
          Character by{" "}
          <a
            className="underline underline-offset-2 hover:text-slate-600"
            href="https://rive.app/marketplace/21097-39950-custom-talking-avatar-real-time-lip-sync-for-your-app/"
            target="_blank"
            rel="noopener noreferrer"
          >
            stvfunm
          </a>{" "}
          &middot; licensed{" "}
          <a
            className="underline underline-offset-2 hover:text-slate-600"
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
          >
            CC BY 4.0
          </a>
        </p>
      )}
    </main>
  );
}
