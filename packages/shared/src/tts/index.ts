import { ElevenLabsTTS } from './elevenlabs.js';
import { MockTTS } from './mock.js';
import type { TTSProvider } from './types.js';

export type { TTSWord, TTSResult, TTSChunk, TTSProvider } from './types.js';
export { MockTTS } from './mock.js';
export { ElevenLabsTTS, charsToWords } from './elevenlabs.js';

/**
 * Pick the TTS impl from env, mock-first. Never throws on a missing key; if
 * elevenlabs is explicitly selected without its key, warn and fall back to mock.
 */
export function getTTS(): TTSProvider {
  if (process.env.TTS_PROVIDER === 'elevenlabs') {
    if (process.env.ELEVENLABS_API_KEY) return new ElevenLabsTTS();
    console.warn('[tts] TTS_PROVIDER=elevenlabs but ELEVENLABS_API_KEY is missing; using mock.');
  }
  return new MockTTS();
}
