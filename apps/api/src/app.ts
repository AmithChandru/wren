import cors from "cors";
import express, { type Express } from "express";

import { env } from "./env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { healthRouter } from "./routes/health.js";
import { ingestRouter } from "./routes/ingest.js";

/**
 * Build and return the configured Express app. No `listen` here so the app can be
 * imported and exercised in tests.
 */
export function createApp(): Express {
  const app = express();

  // CORS restricted to the single web origin for now (see the deployment notes).
  // Multi-origin / per-tenant embed origins (and any credentialed CORS) are
  // deferred to Phase 7 — this static-origin form is intentional, not an oversight.
  app.use(cors({ origin: env.WEB_ORIGIN }));

  // JSON body parsing for API routes. Explicit body-size cap rather than the
  // implicit ~100kb default, so the limit is a deliberate, reviewable decision.
  app.use(express.json({ limit: "1mb" }));

  // Routes. Registered after JSON body parsing, before notFound/errorHandler.
  app.use(healthRouter);
  app.use(ingestRouter);

  // 404 then centralized error handler must be registered last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
