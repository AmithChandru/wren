/**
 * Phase 3 smoke test — proves all three provider factories return working MOCK
 * impls with NO API keys. Run: `pnpm --filter @wren/shared smoke`.
 *
 * It FORCES the mock path deterministically (sets *_PROVIDER=mock and deletes any
 * ambient keys) so the result is independent of the local .env.
 */

import { getLLM, getEmbeddings, getTTS } from '../src/providers.js';

// Force the keyless mock path regardless of ambient env. Importing the barrel
// above does NOT construct any provider (factories read env only when called),
// so setting these before the factory calls below is sufficient and safe.
process.env.LLM_PROVIDER = 'mock';
process.env.EMBEDDINGS_PROVIDER = 'mock';
process.env.TTS_PROVIDER = 'mock';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
delete process.env.VOYAGE_API_KEY;
delete process.env.ELEVENLABS_API_KEY;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`smoke assertion failed: ${msg}`);
}

async function main(): Promise<void> {
  // --- LLM ---
  const llm = getLLM();
  const completion = await llm.complete({
    system: 'You are Maya, a friendly EdTech tutor.',
    messages: [{ role: 'user', content: 'What is photosynthesis?' }],
  });
  console.log(`LLM        provider=${llm.name}`);
  console.log(`           completion=${JSON.stringify(completion)}`);
  assert(llm.name === 'mock', 'LLM should be mock');
  assert(/^\[(neutral|happy|thinking|curious|encouraging)\]/.test(completion), 'completion must start with a valid emotion tag');

  // --- Embeddings ---
  const embeddings = getEmbeddings();
  const [vector] = await embeddings.embed(['What is photosynthesis?']);
  assert(vector !== undefined, 'embeddings returned no vector');
  const norm = Math.hypot(...vector);
  console.log(`Embeddings provider=${embeddings.name} dimension=${embeddings.dimension}`);
  console.log(`           vectorLength=${vector.length} L2norm=${norm.toFixed(6)}`);
  assert(embeddings.name === 'mock', 'embeddings should be mock');
  assert(vector.length === embeddings.dimension, 'vector length must equal dimension');
  assert(Math.abs(norm - 1) < 1e-6, 'vector must be L2-normalized (norm ~ 1)');

  // --- TTS ---
  const tts = getTTS();
  const audio = await tts.synthesize('Hello, this is a mock voice for Maya.');
  const firstWord = audio.words?.[0];
  console.log(`TTS        provider=${tts.name} mime=${audio.mime} bytes=${audio.bytes.length}`);
  console.log(`           words=${audio.words?.length ?? 0} firstWord=${JSON.stringify(firstWord)}`);
  assert(tts.name === 'mock', 'tts should be mock');
  assert(audio.mime === 'audio/wav', 'mock tts mime should be audio/wav');
  assert(audio.bytes.length > 44, 'wav must have a header + data');
  assert((audio.words?.length ?? 0) > 0, 'tts should return word timings');
  assert(firstWord !== undefined && firstWord.end > firstWord.start, 'first word must have a positive duration');

  console.log('\nOK — all three mock providers ran with no API keys.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
