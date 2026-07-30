/**
 * lib/api.ts — typed client for the Wren backend.
 *
 * `postChat` POSTs to /api/chat and returns the typed ChatResponse. The base URL comes
 * from NEXT_PUBLIC_API_URL (default http://localhost:8787). On a non-2xx it reads the
 * `{ error: { message } }` body and throws a clear Error.
 */
import type { ChatRequest, ChatResponse } from "@wren/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

/** Shape of the API's error envelope, used to surface a useful message. */
interface ApiErrorBody {
  error?: { message?: string };
}

export async function postChat(req: ChatRequest): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch (cause) {
    throw new Error(
      `Could not reach the Wren API at ${API_URL}. Is it running? (pnpm --filter api dev)`,
      { cause },
    );
  }

  if (!res.ok) {
    let message = `Request failed (${res.status} ${res.statusText})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Body was not JSON / was empty — keep the status-based message.
    }
    throw new Error(message);
  }

  return (await res.json()) as ChatResponse;
}

/**
 * Turn a base64-encoded audio payload into an object URL playable by `new Audio(url)`.
 * Browser-only (uses `atob`/`Blob`/`URL`). Revoke the URL with `URL.revokeObjectURL`
 * once playback ends to avoid leaking memory.
 */
export function base64ToBlobUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}
