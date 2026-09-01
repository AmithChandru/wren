import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

/**
 * Next only auto-loads `.env` from its OWN directory (apps/web), but this monorepo keeps a
 * single repo-root `.env` (see the setup notes). Without the bridge below, every
 * NEXT_PUBLIC_* value set at the root is silently invisible to the browser and the in-code
 * fallbacks always win — which looks exactly like "my env change did nothing".
 */
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../.env") });

/**
 * Only forward keys that are actually set. Passing `undefined`/"" here would override the
 * `?? default` fallbacks in the app code with an empty string.
 *
 * The renderer accepts either name: the project docs call it CHARACTER_RENDERER, while
 * Next requires the NEXT_PUBLIC_ prefix to expose it client-side. Either one works.
 */
const clientEnv = {};

/**
 * CHARACTER_RENDERER is the documented name, so it WINS.
 * NEXT_PUBLIC_CHARACTER_RENDERER is only the transport Next requires to expose a value to
 * the browser. Preferring the prefixed one would mean editing the documented knob appears
 * to do nothing whenever a stale prefixed copy exists — which is exactly what happened.
 */
const renderer = process.env.CHARACTER_RENDERER ?? process.env.NEXT_PUBLIC_CHARACTER_RENDERER;
const prefixed = process.env.NEXT_PUBLIC_CHARACTER_RENDERER;
if (process.env.CHARACTER_RENDERER && prefixed && process.env.CHARACTER_RENDERER !== prefixed) {
  console.warn(
    `[wren] .env sets CHARACTER_RENDERER="${process.env.CHARACTER_RENDERER}" but ` +
      `NEXT_PUBLIC_CHARACTER_RENDERER="${prefixed}". Using "${process.env.CHARACTER_RENDERER}" ` +
      `(the documented name). Delete one of them to remove the ambiguity.`,
  );
}
if (renderer) clientEnv.NEXT_PUBLIC_CHARACTER_RENDERER = renderer;
for (const key of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_TENANT_ID"]) {
  if (process.env[key]) clientEnv[key] = process.env[key];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: clientEnv,
};

export default nextConfig;
