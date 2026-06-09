import type { TTSProvider, TTSResult, TTSWord } from './types.js';

/** Character-level alignment as returned by the with-timestamps endpoint. */
interface ElevenLabsAlignment {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}

interface ElevenLabsResponse {
  audio_base64: string;
  alignment: ElevenLabsAlignment;
}

/** Validate the untrusted HTTP response shape before decoding it. */
function isElevenLabsResponse(v: unknown): v is ElevenLabsResponse {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { audio_base64?: unknown; alignment?: unknown };
  return typeof o.audio_base64 === 'string' && typeof o.alignment === 'object' && o.alignment !== null;
}

/**
 * ElevenLabs-backed TTS via global fetch.
 * Constructed by the factory ONLY when TTS_PROVIDER === 'elevenlabs' AND
 * ELEVENLABS_API_KEY is present.
 *
 * Endpoint/model id move over time — confirm against the current
 * ElevenLabs docs before shipping a real key. Streaming is Phase 7.
 */
export class ElevenLabsTTS implements TTSProvider {
  readonly name = 'elevenlabs';

  async synthesize(text: string, voiceId?: string): Promise<TTSResult> {
    const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID;
    if (!voice) throw new Error('ElevenLabs: no voiceId (pass one or set ELEVENLABS_VOICE_ID)');

    // The factory guards this, but read into a checked local rather than casting
    // away `string | undefined` (and so we never send a literal `undefined` header).
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ElevenLabs: missing ELEVENLABS_API_KEY');

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.4, similarity_boost: 0.7 },
        }),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs TTS ${res.status}`);

    const json: unknown = await res.json();
    if (!isElevenLabsResponse(json)) {
      throw new Error('ElevenLabs TTS: unexpected response shape');
    }
    const bytes = base64ToBytes(json.audio_base64);
    return { mime: 'audio/mpeg', bytes, words: charsToWords(json.alignment) };
  }
}

function base64ToBytes(b64: string): Uint8Array {
  // `atob` is available as a global in Node 20 and the browser.
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Collapse character-level alignment into word timings. A word's start is its
 * first non-space char's start; its end is its last char's end.
 */
export function charsToWords(alignment: ElevenLabsAlignment): TTSWord[] {
  const characters = alignment.characters ?? [];
  const character_start_times_seconds = alignment.character_start_times_seconds ?? [];
  const character_end_times_seconds = alignment.character_end_times_seconds ?? [];
  const words: TTSWord[] = [];

  let current = '';
  let start = 0;
  let end = 0;

  const flush = (): void => {
    if (current.length > 0) {
      words.push({ word: current, start, end });
      current = '';
    }
  };

  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i] ?? '';
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    if (current.length === 0) start = character_start_times_seconds[i] ?? 0;
    current += ch;
    end = character_end_times_seconds[i] ?? start;
  }
  flush();

  return words;
}
