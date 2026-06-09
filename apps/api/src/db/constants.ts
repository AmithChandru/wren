// Stable, human-readable id for the single v1 demo tenant ("Demo School").
// Kept in a side-effect-free module so ingestion/seed tooling can import it
// without executing the seed script (importing prisma/seed.ts runs main()).
// Phase 4's /ingest-sample targets this tenant deterministically.
export const DEMO_TENANT_ID = "demo-tenant";
