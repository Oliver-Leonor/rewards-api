import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { fail } from "../lib/utils.js";

// This middleware factory takes a Zod schema and returns
// an Express middleware. It validates req.body against the
// schema and either:
// - Passes: replaces req.body with the parsed (clean) data
// - Fails: sends a 400 with the validation errors
//
// Usage in routes:
//   router.post("/earn", validate(earnPointsSchema), handler)

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");

      res.status(400).json(fail(message));
      return;
    }

    req.body = result.data;
    next();
  };
}
