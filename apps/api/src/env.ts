import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Load env from the repo-root `.env` BEFORE reading `process.env`. This file lives
// at apps/api/src/env.ts, so the repo root is three directories up. We only point
// dotenv at the file; its contents are managed outside this codebase. dotenv does
// not override variables already present in process.env, so shell-supplied values
// (e.g. in CI or `PORT=... pnpm ...`) win over the file.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Coerced positive integer. z.coerce.number() turns "abc" into NaN, which fails
  // the int()/positive() checks, so non-numeric values are rejected.
  PORT: z.coerce.number().int().positive().default(4000),

  // CORS is restricted to this origin (see app.ts). Must be a valid URL.
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),

  // Optional for now so the app boots with zero configuration (mock-first).
  // Phase 2 (rag-engineer) makes this required when Prisma is wired.
  DATABASE_URL: z.string().url().optional(),

  // Admin secret guarding write/admin ops (currently POST /api/ingest). OPTIONAL so
  // the app still boots with zero configuration. When UNSET, the ingest route fails
  // CLOSED (503) rather than running unauthenticated. A min length avoids an empty
  // string passing as "configured". Never logged or echoed.
  ADMIN_API_SECRET: z.string().min(1).optional(),

  // NOTE: Provider keys (LLM/embeddings/TTS) live in the shared provider factories
  // and are read from process.env there, not validated here.
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print a clear, human-readable message instead of throwing a raw ZodError, then
  // fail fast. Never start the server with invalid configuration.
  console.error("❌ Invalid environment variables:");
  const { fieldErrors } = parsed.error.flatten();
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages && messages.length > 0) {
      console.error(`  - ${field}: ${messages.join(", ")}`);
    }
  }
  process.exit(1);
}

export const env = Object.freeze(parsed.data);

export type Env = typeof env;
