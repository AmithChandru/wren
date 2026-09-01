# Wren

An embeddable AI character for web products. A friendly animated character answers a
user's question with an LLM, speaks the answer with TTS, and lip-syncs in real time.

The v1 target is a single embeddable widget configured as an EdTech tutor named **Maya**,
backed by retrieval over a client's own content (RAG).

> Status: pre-release. Runs locally; not deployed anywhere.

## Layout

```
apps/api          Express 5 + TypeScript API — chat, ingestion, retrieval
apps/web          Next.js 15 widget — chat UI + character renderer
packages/shared   provider interfaces, shared types, the character driver
```

## Requirements

- Node 20+
- pnpm 9
- PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension

## Quick start

```bash
pnpm install
cp .env.example .env          # then edit; see "Configuration"
pnpm --filter api db:migrate  # creates tables + the vector column/index
pnpm -w dev                   # web on :3000, api on :4000
```

**No API keys are required to run it.** Every external provider has a mock
implementation, and the factories fall back to the mock (with a warning) when a key is
absent, so the whole stack works end to end offline. To verify the keyless path:

```bash
pnpm --filter @wren/shared smoke
```

## Configuration

Configuration lives in a single repo-root `.env`; `.env.example` documents every key.
Next.js only auto-loads `.env` from `apps/web`, so `apps/web/next.config.mjs` forwards
the root file's values into the web build.

| Concern | Providers |
| --- | --- |
| LLM | `mock` (default), `anthropic` |
| Embeddings | `mock` (default), `openai` (1536-d), `voyage` (1024-d) |
| TTS | `mock` (default), `elevenlabs` |
| Character renderer | `svg` (default), `rive` — via `CHARACTER_RENDERER` |

The embedding dimension must match the `Chunk.embedding vector(N)` column. A mismatch
throws at insert time rather than corrupting the index.

## Architecture notes

**Providers are swappable interfaces.** `LLMProvider`, `EmbeddingsProvider` and
`TTSProvider` live in `packages/shared`, each with a mock plus at least one real
implementation. Factories read env and never throw at import.

**The shared package is split by subpath export** — `.` (browser-safe, types only),
`./providers` (Node-only, holds the vendor SDKs) and `./character`. The web app imports
only the safe entries, so the browser bundle never pulls in a server SDK.

**Vectors are raw SQL.** Prisma cannot query the `vector` type, so `embedding` is declared
`Unsupported("vector(1536)")` to keep the schema in sync, and all inserts and searches go
through `$executeRaw` / `$queryRaw` with the `<=>` cosine operator. The extension, column
and HNSW index are added by a hand-written migration.

**Multi-tenant from day one.** Every row and every retrieval query is scoped by
`tenantId`, including a denormalized `Chunk.tenantId` so vector search needs no join.
`searchChunks()` in `apps/api/src/db/vector.ts` is the single choke point and always
filters by tenant. `pnpm --filter api ingest:sample` asserts that a cross-tenant query
returns zero rows.

**The character renderer is an abstraction.** `CharacterRenderer` has two
implementations behind one flag: `svg` (pure code, always works) and `rive` (needs a
`.riv` asset). The shared driver maps text and TTS word timings onto viseme cues and is
renderer-agnostic.

## API

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/health` | none |
| `POST` | `/api/chat` | none (CORS-pinned to `WEB_ORIGIN`) |
| `POST` | `/api/ingest` | `x-admin-secret` header |

All request bodies are validated with zod. The ingest guard uses a constant-time compare
and fails closed when `ADMIN_API_SECRET` is unset.

## Development

```bash
pnpm -w typecheck
pnpm -w lint
pnpm -w build
pnpm --filter api ingest:sample   # end-to-end RAG check against the demo tenant
```

TypeScript is strict, with `noUncheckedIndexedAccess`, `noImplicitOverride` and
`noFallthroughCasesInSwitch`. There are no `any`s in application code.

## Known gaps

- No automated tests. `packages/shared/scripts/smoke.ts` and
  `apps/api/scripts/ingest-sample.ts` are manual assertion scripts.
- No CI, no container image, no deployment.
- Streaming is not implemented; `LLMProvider.stream` and `TTSProvider.stream` are declared
  optional and unused. Chat is request/response.
- Tenant isolation is enforced in application code, not by Postgres row-level security.
- No structured logging, metrics or tracing.
- Retrieval quality has only been exercised with mock (non-semantic) embeddings.
- English only — the character-to-viseme mapping is Latin-script.
- In the Rive renderer, `setExpression` and `setGaze` are no-ops: the current asset
  exposes mouth poses only.

## Credits

The Rive character asset in `apps/web/public/character.riv` is "Custom Talking Avatar:
Real-Time Lip Sync for Your App" by stvfunm, from the Rive Community marketplace,
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). CC BY requires visible
attribution wherever this ships; the credit is rendered in `apps/web/app/page.tsx`.
