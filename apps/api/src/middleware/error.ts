import type { ErrorRequestHandler, RequestHandler } from "express";

/**
 * An error carrying an HTTP status code. Routes/services may throw this to control
 * the response status; anything else becomes a generic 500.
 *
 * CONTRACT: for 4xx statuses the `message` is surfaced VERBATIM to the client, so
 * callers must keep it free of provider/internal detail or secrets. 5xx messages
 * are always replaced with a generic string by `errorHandler`.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** 404 handler for unmatched routes. Returns JSON, never HTML. */
export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({ error: { message: `Not found: ${req.method} ${req.path}` } });
};

/**
 * Centralized Express error handler. Logs the real error server-side and responds
 * with a generic JSON body. NEVER leaks stack traces or internal/provider error
 * details to the client.
 *
 * Must keep 4 parameters so Express recognizes it as error-handling middleware;
 * `_next` is unused but required for that arity.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;

  // Log the full error (including stack) on the server only.
  console.error(`[error] ${req.method} ${req.path}`, err);

  // For 5xx, return a fixed generic message so internal details never reach the
  // client. For known 4xx (HttpError), the provided message is safe to surface.
  const message =
    err instanceof HttpError && status < 500 ? err.message : "Internal Server Error";

  res.status(status).json({ error: { message } });
};
