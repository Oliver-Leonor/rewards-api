import type { Request, Response, NextFunction } from "express";
import { fail } from "../lib/utils.js";

// Express error handlers must have exactly 4 parameters.
// Express identifies them by the (err, req, res, next) signature.
// In production, you'd log to a service like Datadog/Sentry here.

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error("[ERROR]", err.message, err.stack);

  res.status(500).json(fail("Internal server error"));
}
