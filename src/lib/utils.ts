import crypto from "node:crypto";

// Prefixed IDs make debugging much easier. When you see "txn_a1b2c3"
// in a log, you instantly know it's a transaction without checking
// the table. Same pattern as Stripe's "cus_", "pi_", "sub_" prefixes.

export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}_${uuid}`;
}

// Standard API response shape. Having a consistent envelope means
// the frontend always knows where to find data vs errors.

export type ApiResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function fail(error: string): ApiResponse {
  return { ok: false, error };
}
