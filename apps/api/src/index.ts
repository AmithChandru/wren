import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";

// Load env from the repo-root `.env` (this file lives at apps/api/src/index.ts,
// so the repo root is three directories up). We only point dotenv at the file;
// the file's contents are managed outside this codebase.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

const app = express();

// Phase 0: no routes yet. Routes (/health, /api/*) arrive in Phase 1+.

const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`api listening on :${port}`);
});
