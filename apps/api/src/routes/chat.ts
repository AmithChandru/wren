// POST /api/chat — the public, non-streaming chat endpoint the widget calls.
//
// Public (no admin secret): CORS already restricts callers to WEB_ORIGIN. All
// tenant isolation is enforced in services/chat.ts (every query is scoped by
// tenantId). Here we only validate the body and reject an unknown tenant early.

import { Router } from "express";
import { z } from "zod";

import { prisma } from "../db/client.js";
import { HttpError } from "../middleware/error.js";
import { chat } from "../services/chat.js";

// Explicit annotation: tsc cannot otherwise name the inferred Router type without
// referencing a deep @types/express-serve-static-core path (TS2742, not portable).
export const chatRouter: Router = Router();

// ChatRequest (the architecture notes). Non-empty mins reject blank strings; the
// max bounds the request so a huge body can't be forwarded to the LLM.
const chatBodySchema = z.object({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  message: z.string().min(1).max(4000),
});

chatRouter.post("/api/chat", async (req, res, next) => {
  try {
    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
        .join("; ");
      throw new HttpError(400, `Invalid chat request: ${detail}`);
    }

    // Reject an unknown tenantId with a clear 400 rather than letting a session
    // create surface a raw FK violation as a 500. This findUnique reads only the
    // tenant row; it never touches another tenant's sessions.
    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      // Public endpoint: don't reflect the client-supplied id back in the response;
      // log it server-side for debugging instead.
      console.warn(`[chat] rejected unknown tenantId: ${parsed.data.tenantId}`);
      throw new HttpError(400, "Unknown tenant");
    }

    const result = await chat(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
