import { Router } from "express";

// Explicit annotation: tsc cannot otherwise name the inferred Router type without
// referencing a deep @types/express-serve-static-core path (TS2742, not portable).
export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});
