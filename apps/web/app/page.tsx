"use client";
/**
 * page.tsx — local dev playground (Phase 6).
 *
 * Owns the character ref, lays out Maya above the chat, and wires them together. The
 * ref type is the shared CharacterRenderer contract; Chat drives it on each reply.
 */
import { useRef } from "react";
import type { CharacterRenderer } from "@wren/shared/character";
import { Character } from "../components/character/Character";
import { Chat } from "../components/Chat";

export default function Home() {
  const characterRef = useRef<CharacterRenderer>(null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-amber-50 to-teal-50 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-slate-800">Maya — your AI tutor</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ask a question. Maya answers, speaks, and lip-syncs in real time.
        </p>
      </header>

      <Character ref={characterRef} className="h-72 w-72 drop-shadow-sm" />

      <Chat character={characterRef} />
    </main>
  );
}
