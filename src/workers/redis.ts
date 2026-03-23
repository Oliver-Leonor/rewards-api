import dotenv from "dotenv";

dotenv.config();

// BullMQ requires a plain connection config object, not an ioredis instance.
// It creates its own connections internally (one for commands, one for
// blocking subscriptions).
//
// maxRetriesPerRequest: null is REQUIRED by BullMQ. Without it,
// ioredis will timeout on BRPOPLPUSH (the blocking operation BullMQ
// uses to wait for new jobs). This is a common gotcha.

export const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
  maxRetriesPerRequest: null as null,
  // Upstash Redis requires TLS
  ...(process.env.REDIS_TLS === "true" ? { tls: {} } : {}),
};
