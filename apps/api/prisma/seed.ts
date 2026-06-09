// Seed the database with the single v1 tenant ("Demo School") and its Maya persona.
//
// Idempotent: re-running this script upserts on stable ids and never creates
// duplicates. The demo tenant uses a stable, human-readable id so Phase 4's
// /ingest-sample can target it deterministically.

import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

import { DEMO_TENANT_ID } from "../src/db/constants.js";

// Make this script self-sufficient when run directly (e.g. `tsx prisma/seed.ts`).
// This file lives at apps/api/prisma/seed.ts, so the repo-root .env is THREE
// directories up (prisma -> api -> apps -> repo root). dotenv does NOT override
// variables already present in process.env, so this is safe alongside the
// dotenv-cli bridge used by `db:seed` (whichever loads first wins; same value).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../../.env") });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Idempotent "create if missing, otherwise leave untouched": the update
  // branches are intentionally empty so re-running the seed never clobbers a
  // persona prompt/voiceId configured later (Phase 5) or by an operator.
  const tenant = await prisma.tenant.upsert({
    where: { id: DEMO_TENANT_ID },
    update: {},
    create: { id: DEMO_TENANT_ID, name: "Demo School" },
  });

  const persona = await prisma.persona.upsert({
    // Persona has a unique tenantId, so we can upsert by tenant.
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Maya",
      // Placeholder prompt; finalized in Phase 5 (apps/api/src/prompt/persona.ts).
      systemPrompt: "You are Maya, a friendly, encouraging EdTech tutor.",
      voiceId: null,
    },
  });

  console.log("Seed complete:");
  console.log(`  Tenant:  ${tenant.name} (id: ${tenant.id})`);
  console.log(`  Persona: ${persona.name} (id: ${persona.id}, voiceId: ${persona.voiceId ?? "null"})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
