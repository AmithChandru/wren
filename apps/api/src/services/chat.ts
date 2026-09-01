// Chat orchestration — the non-streaming POST /api/chat lifecycle from
// the architecture notes: resolve session -> load history -> retrieve -> build
// prompt -> LLM -> parse emotion -> synthesize (non-fatal) -> persist -> respond.
//
// Tenant isolation: every Session/Message/Persona/retrieve query below is scoped
// by req.tenantId. A session is loaded with `AND tenantId`, so a session created
// under tenant A is never readable by tenant B.

import { buildVisemeTimeline } from "@wren/shared/character";
import { getLLM, getTTS, type LLMMessage } from "@wren/shared/providers";
import type { ChatRequest, ChatResponse } from "@wren/shared";

import { prisma } from "../db/client.js";
import { MAYA_SYSTEM_PROMPT, buildSystemPrompt, parseEmotion } from "../prompt/persona.js";
import { retrieve } from "./rag.js";

/** How many recent messages of prior history to feed the LLM as context. */
const HISTORY_LIMIT = 10;
/** Number of chunks to retrieve for grounding. */
const RETRIEVE_K = 5;
/** Cap on the LLM completion length for a single tutor turn. */
const MAX_TOKENS = 600;

/**
 * Run one chat turn. The caller (route) guarantees `req.tenantId` exists, so a
 * missing tenant is a 400 handled upstream, not an FK error here.
 */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  // 1. Resolve an EXISTING session, tenant-scoped. We NEVER load a session by id
  //    alone — the `tenantId` guard is what enforces isolation; an absent/unknown/
  //    wrong-tenant id yields null. Creating a NEW session is DEFERRED to the
  //    persistence transaction (step 8) so a failed turn leaves no orphan session.
  const existing = req.sessionId
    ? await prisma.session.findFirst({
        where: { id: req.sessionId, tenantId: req.tenantId },
        select: { id: true },
      })
    : null;

  // 2. Load the most RECENT history (newest-first, then reversed to chronological)
  //    BEFORE persisting this turn so the new message isn't duplicated. Empty for a
  //    brand-new session. Scoped via the already-tenant-scoped session id.
  const history: LLMMessage[] = existing
    ? (
        await prisma.message.findMany({
          where: { sessionId: existing.id },
          orderBy: { createdAt: "desc" },
          select: { role: true, content: true },
          take: HISTORY_LIMIT,
        })
      )
        .reverse()
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        }))
    : [];

  // 3. Retrieve grounding chunks (tenant-scoped inside `retrieve`).
  const chunks = await retrieve(req.tenantId, req.message, RETRIEVE_K);

  // 4. Build the prompt. Use the tenant's persona prompt/voice if configured,
  //    falling back to the canonical Maya prompt.
  const persona = await prisma.persona.findUnique({
    where: { tenantId: req.tenantId },
    select: { systemPrompt: true, voiceId: true },
  });
  const system = buildSystemPrompt({
    basePersona: persona?.systemPrompt || MAYA_SYSTEM_PROMPT,
    chunks,
  });
  const messages: LLMMessage[] = [...history, { role: "user", content: req.message }];

  // 5. LLM completion (raw text beginning with an [emotion] tag).
  const raw = await getLLM().complete({ system, messages, maxTokens: MAX_TOKENS });

  // 6. Parse + strip the emotion tag.
  const { emotion, text } = parseEmotion(raw);

  // 7. Synthesize speech — NON-FATAL. On any TTS failure, log server-side and
  //    degrade to text-only (omit `audio`) per the architecture notes. No secrets
  //    are logged (the provider error, not credentials).
  let audio: ChatResponse["audio"];
  let visemes: ChatResponse["visemes"];
  try {
    const result = await getTTS().synthesize(text, persona?.voiceId ?? undefined);
    audio = { mime: result.mime, base64: Buffer.from(result.bytes).toString("base64") };
    // Providers that report word timings (ElevenLabs) let us ship a REAL viseme timeline
    // instead of leaving the client to assume a constant speaking rate. Providers that
    // don't (the mock) yield an empty timeline, and the client falls back to the estimate.
    const timeline = buildVisemeTimeline(text, result.words ?? []);
    if (timeline.length > 0) visemes = timeline;
  } catch (err) {
    console.error("[chat] TTS failed, returning text-only:", err);
  }

  // 8. Persist atomically. Create the session (if new) and BOTH messages in ONE
  //    transaction so a failure can't leave a dangling user message or an empty
  //    orphan session. Inside a transaction Postgres now() is constant, so we set
  //    explicit createdAt (+1ms for the assistant) to keep a deterministic
  //    intra-turn order for the history query above.
  const userAt = new Date();
  const assistantAt = new Date(userAt.getTime() + 1);
  const sessionId = await prisma.$transaction(async (tx) => {
    const sid =
      existing?.id ??
      (await tx.session.create({ data: { tenantId: req.tenantId }, select: { id: true } })).id;
    await tx.message.create({
      data: { sessionId: sid, role: "user", content: req.message, createdAt: userAt },
    });
    await tx.message.create({
      data: { sessionId: sid, role: "assistant", content: text, emotion, createdAt: assistantAt },
    });
    return sid;
  });

  // 9. Respond. `visemes` carries the measured timeline when the TTS provider reported
  //    word timings; it is omitted otherwise so the client knows to estimate.
  return {
    sessionId,
    emotion,
    text,
    ...(audio ? { audio } : {}),
    ...(visemes ? { visemes } : {}),
  };
}
