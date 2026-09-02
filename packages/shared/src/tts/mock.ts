import type { TTSProvider, TTSResult, TTSWord } from './types.js';

/** Mock speaking rate: ~13 chars/s, roughly a natural speaking pace. */
const CHARS_PER_SECOND = 13;
const SAMPLE_RATE = 16000; // mono PCM16

/**
 * Keyless TTS. Returns a SHORT but VALID silent WAV sized to the estimated
 * speaking duration (~13 chars/s), plus estimated per-word timings at that rate.
 * Phase 6 can actually load/play the buffer; the lip-sync driver animates the
 * mouth from `words`. No audio is heard (silence) and no API key is used.
 */
export class MockTTS implements TTSProvider {
  readonly name = 'mock';

  async synthesize(text: string, _voiceId?: string): Promise<TTSResult> {
    const trimmed = text.trim();
    const totalSeconds = Math.max(0.2, trimmed.length / CHARS_PER_SECOND);
    const bytes = silentWav(totalSeconds, SAMPLE_RATE);
    return { mime: 'audio/wav', bytes, words: estimateWords(trimmed) };
  }
}

/** Distribute words across the timeline proportionally to their char length. */
function estimateWords(text: string): TTSWord[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  // Weight each word by its length (+1 for the trailing space) so longer words
  // get more time. Cursor advances in seconds at CHARS_PER_SECOND.
  let cursor = 0;
  return tokens.map((word) => {
    const durSeconds = (word.length + 1) / CHARS_PER_SECOND;
    const start = round3(cursor);
    cursor += durSeconds;
    return { word, start, end: round3(cursor) };
  });
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Build a minimal, valid PCM16 mono WAV of silence. 44-byte canonical header +
 * zeroed sample data. Kept small and dependency-free (no audio library).
 */
function silentWav(seconds: number, sampleRate: number): Uint8Array {
  const numSamples = Math.max(1, Math.round(seconds * sampleRate));
  const bytesPerSample = 2; // PCM16
  const numChannels = 1;
  const dataSize = numSamples * bytesPerSample * numChannels;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // chunk size
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  // Sample region is already zero-filled (silence).

  return new Uint8Array(buffer);
}
