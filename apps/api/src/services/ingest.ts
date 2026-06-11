// Ingestion: chunk a document -> embed every chunk -> store content + embedding
// (+ denormalized tenantId) via raw SQL.
//
// Tenant isolation: the Document and every Chunk carry the caller's tenantId; no
// row is written without it.

import { randomUUID } from "node:crypto";

import { getEmbeddings } from "@wren/shared/providers";

import { prisma } from "../db/client.js";
import { EMBEDDING_DIM, insertChunk } from "../db/vector.js";

/** Result of ingesting one document. */
export interface IngestResult {
  documentId: string;
  chunks: number;
}

// Chunking targets (approximate tokens, no tokenizer dependency). We approximate
// 1 token ~= 4 characters of English prose, so the char targets below correspond
// to roughly a 300-500 token window with ~50-token overlap:
//   - target  ~400 tokens  -> ~1600 chars
//   - max     ~500 tokens  -> ~2000 chars (hard cap before forcing a flush)
//   - overlap ~50  tokens  -> ~200  chars carried into the next chunk
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 400;
const MAX_TOKENS = 500;
const OVERLAP_TOKENS = 50;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

/**
 * Strip light Markdown/boilerplate and collapse whitespace so chunk text is clean.
 * Intentionally conservative: it removes structural noise (heading markers,
 * blockquote markers, list bullets, horizontal rules) without rewriting prose.
 */
function cleanText(raw: string): string {
  return raw
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "") // ATX heading markers: "## Title" -> "Title"
        .replace(/^\s{0,3}>\s?/, "") // blockquote markers
        .replace(/^\s{0,3}[-*+]\s+/, "") // unordered list bullets
        .replace(/^\s{0,3}\d+\.\s+/, "") // ordered list markers
        .trim(),
    )
    .join("\n")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "") // horizontal rules
    .replace(/[ \t]+/g, " ") // collapse intra-line whitespace
    .replace(/\n{3,}/g, "\n\n") // collapse blank-line runs to a single blank line
    .trim();
}

/**
 * Last-resort splitter for a run of text longer than MAX_CHARS with no usable
 * sentence boundary (a no-space blob, or a punctuation-less script like CJK/Thai).
 * Cuts at the nearest word boundary at or before the cap, falling back to a hard
 * character cut when there is no space, so no piece ever exceeds MAX_CHARS.
 */
function hardSplit(s: string): string[] {
  const pieces: string[] = [];
  let rest = s.trim();
  while (rest.length > MAX_CHARS) {
    let cut = rest.lastIndexOf(" ", MAX_CHARS);
    if (cut < MAX_CHARS * 0.6) cut = MAX_CHARS; // no good word boundary -> hard cut
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Split text into ~300-500 token chunks with ~50-token overlap, respecting
 * paragraph and sentence boundaries.
 *
 * Strategy: accumulate whole paragraphs until adding the next one would exceed the
 * target size, then flush. A paragraph larger than the hard cap is sub-split on
 * sentence boundaries. Each new chunk is seeded with a small character overlap
 * (the tail of the previous chunk) so context that straddles a boundary is not
 * lost. Returns clean, non-empty chunk strings.
 */
export function chunkText(text: string): string[] {
  const cleaned = cleanText(text);
  if (cleaned.length === 0) return [];

  // Units to accumulate: paragraphs, but any paragraph over the hard cap is first
  // broken into sentence-sized pieces so a single unit never blows past MAX_CHARS.
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHARS) {
      units.push(paragraph);
      continue;
    }
    // Sub-split a long paragraph on sentence boundaries (after . ! ? + space).
    const sentences = paragraph.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [paragraph];
    let buf = "";
    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;
      // A single "sentence" can still exceed the cap when the text has no .!?
      // punctuation (one giant paragraph, or a script with no ASCII sentence marks).
      // Hard-split it so no unit ever exceeds MAX_CHARS — otherwise a real provider
      // could reject the over-long input at embed time.
      if (s.length > MAX_CHARS) {
        if (buf) {
          units.push(buf);
          buf = "";
        }
        for (const piece of hardSplit(s)) units.push(piece);
        continue;
      }
      if (buf && buf.length + 1 + s.length > MAX_CHARS) {
        units.push(buf);
        buf = s;
      } else {
        buf = buf ? `${buf} ${s}` : s;
      }
    }
    if (buf) units.push(buf);
  }

  const chunks: string[] = [];
  let current = "";

  const flush = (): void => {
    const trimmed = current.trim();
    if (!trimmed) return;
    chunks.push(trimmed);
    // Seed the next chunk with the tail of this one (~OVERLAP_CHARS), snapped to a
    // word boundary so we don't split a token mid-word. Best-effort: if the tail has
    // no space (one long token), carry no overlap rather than split mid-word.
    if (trimmed.length > OVERLAP_CHARS) {
      const tail = trimmed.slice(trimmed.length - OVERLAP_CHARS);
      const firstSpace = tail.indexOf(" ");
      current = firstSpace === -1 ? "" : tail.slice(firstSpace + 1);
    } else {
      current = "";
    }
  };

  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    // Flush before appending if we've reached the target AND already have content,
    // so chunks land near the target rather than always at the max.
    if (current && candidate.length > TARGET_CHARS) {
      flush();
      current = current ? `${current}\n\n${unit}` : unit;
    } else {
      current = candidate;
    }
  }
  flush();

  return chunks;
}

/**
 * Ingest one document for a tenant: chunk -> embed (one batched call) -> store.
 *
 * Fails LOUD if the active embeddings provider's dimension does not match the
 * vector(N) column (guards the Voyage-1024-vs-1536 mismatch): we assert up front
 * rather than letting Postgres reject the insert. The Document create + all chunk
 * inserts run in a single transaction for atomicity (no orphan documents).
 */
export async function ingestDocument(args: {
  tenantId: string;
  title: string;
  text: string;
  source?: string;
}): Promise<IngestResult> {
  const { tenantId, title, text, source } = args;

  const chunkTexts = chunkText(text);
  if (chunkTexts.length === 0) {
    throw new Error("ingestDocument: text produced no chunks after cleaning");
  }

  const embeddings = getEmbeddings();
  if (embeddings.dimension !== EMBEDDING_DIM) {
    throw new Error(
      `ingestDocument: embeddings provider "${embeddings.name}" has dimension ` +
        `${embeddings.dimension}, but the Chunk column is vector(${EMBEDDING_DIM}). ` +
        `Change the embeddings provider/model OR the column (raw SQL migration) so they match.`,
    );
  }

  // One batched embed call for all chunks (vectors[i] <-> chunkTexts[i]).
  const vectors = await embeddings.embed(chunkTexts);
  if (vectors.length !== chunkTexts.length) {
    throw new Error(
      `ingestDocument: embeddings returned ${vectors.length} vectors for ` +
        `${chunkTexts.length} chunks`,
    );
  }
  // Defense-in-depth: a provider could self-report dimension N yet return a
  // wrong-length or non-finite vector. Fail loud here rather than as an opaque 500
  // from the Postgres ::vector cast.
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (v === undefined || v.length !== EMBEDDING_DIM || !v.every((x) => Number.isFinite(x))) {
      throw new Error(
        `ingestDocument: embedding ${i} is invalid (length ${v?.length ?? "missing"}, ` +
          `expected ${EMBEDDING_DIM} finite numbers)`,
      );
    }
  }

  const documentId = await prisma.$transaction(async (tx) => {
    const doc = await tx.document.create({
      data: { tenantId, title, source: source ?? null },
    });

    for (let i = 0; i < chunkTexts.length; i++) {
      const content = chunkTexts[i];
      const embedding = vectors[i];
      // noUncheckedIndexedAccess: both are guaranteed present (lengths matched
      // above), but narrow explicitly to satisfy strict TS.
      if (content === undefined || embedding === undefined) {
        throw new Error(`ingestDocument: missing chunk/vector at index ${i}`);
      }
      // Pass `tx` so the raw vector insert runs inside the SAME interactive
      // transaction as the Document create above — they commit/rollback together
      // (no orphan Document if a chunk insert fails).
      await insertChunk(
        {
          id: randomUUID(),
          tenantId,
          documentId: doc.id,
          content,
          embedding,
        },
        tx,
      );
    }

    return doc.id;
  });

  return { documentId, chunks: chunkTexts.length };
}
