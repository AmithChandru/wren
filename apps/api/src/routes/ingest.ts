import { timingSafeEqual } from "node:crypto";

import { type RequestHandler, Router } from "express";
import { z } from "zod";

import { prisma } from "../db/client.js";
import { env } from "../env.js";
import { HttpError } from "../middleware/error.js";
import { ingestDocument } from "../services/ingest.js";

// Explicit annotation: tsc cannot otherwise name the inferred Router type without
// referencing a deep @types/express-serve-static-core path (TS2742, not portable).
export const ingestRouter: Router = Router();

// IngestRequest (the architecture notes). All fields required except `source`; the
// non-empty mins reject blank strings that would otherwise pass `string`.
const ingestBodySchema = z.object({
  tenantId: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  source: z.string().optional(),
});

/**
 * Constant-time compare of the presented secret against the configured one. Returns
 * false for absent/mismatched-length inputs WITHOUT branching on the secret's
 * content. timingSafeEqual throws if buffer lengths differ, so we length-guard
 * first; that guard leaks only the secret's LENGTH (acceptable), never its bytes.
 */
function secretMatches(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Admin guard for POST /api/ingest.
 *  - Secret UNSET  -> 503 (fail CLOSED; ingestion is disabled, not open).
 *  - Header absent/wrong -> 401.
 * The secret is never logged or echoed.
 */
const requireAdmin: RequestHandler = (req, res, next) => {
  const expected = env.ADMIN_API_SECRET;
  if (!expected) {
    res
      .status(503)
      .json({ error: { message: "ingest disabled: ADMIN_API_SECRET not configured" } });
    return;
  }

  // req.header() is typed string | undefined for a non-"set-cookie" name;
  // secretMatches handles the undefined (absent) case.
  const header = req.header("x-admin-secret");
  if (!secretMatches(header, expected)) {
    res.status(401).json({ error: { message: "Unauthorized" } });
    return;
  }

  next();
};

// POST /api/ingest — chunk + embed + store a document for a tenant.
ingestRouter.post("/api/ingest", requireAdmin, async (req, res, next) => {
  try {
    const parsed = ingestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(body)"}: ${i.message}`)
        .join("; ");
      throw new HttpError(400, `Invalid ingest request: ${detail}`);
    }

    // Reject an unknown tenantId with a clear 400 rather than surfacing the raw
    // Document_tenantId_fkey violation as a 500.
    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new HttpError(400, `Unknown tenantId: ${parsed.data.tenantId}`);

    const result = await ingestDocument(parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
