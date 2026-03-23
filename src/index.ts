import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { usersRouter } from "./routes/users.js";
import { rewardsRouter } from "./routes/rewards.js";
import { transactionsRouter } from "./routes/transactions.js";
import { errorHandler } from "./middleware/error-handler.js";
import { checkDb } from "./db/connection.js";
import { startRedemptionWorker } from "./workers/redemption-worker.js";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT ?? "4000", 10);

// ── Global middleware ──
// cors() allows the Next.js frontend (different origin) to call this API.
// Without it, the browser blocks cross-origin requests.
// In production, you'd restrict this to your frontend domain.

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  })
);

// express.json() parses incoming JSON request bodies.
// The limit prevents someone sending a 100MB JSON payload
// and crashing your server (a common denial-of-service vector).

app.use(express.json({ limit: "1mb" }));

// ── Health check ──
// Load balancers (Railway, AWS ALB) ping this to know if the
// server is alive. If the DB is down, we return 503 so the
// load balancer stops sending traffic to this instance.

app.get("/health", async (_req, res) => {
  const dbOk = await checkDb();

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "healthy" : "degraded",
    db: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ──
// Each router handles a resource. The prefix creates the full path:
//   usersRouter's GET "/" becomes GET /api/users
//   rewardsRouter's GET "/:id" becomes GET /api/rewards/:id
//
// transactionsRouter mounts at /api because it has mixed paths:
//   /api/events/purchase, /api/rewards/:id/redeem, /api/users/:id/transactions

app.use("/api/users", usersRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api", transactionsRouter);

// ── Error handler (must be last) ──
// Express identifies error handlers by the 4-parameter signature.
// If any route throws, Express skips to this handler.

app.use(errorHandler);

// ── Start ──

app.listen(PORT, () => {
  console.log(`[SERVER] Rewards API running on http://localhost:${PORT}`);
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);

  // Start the BullMQ worker in the same process.
  // In production, you'd run this separately:
  //   node dist/workers/redemption-worker.js
  if (process.env.ENABLE_WORKER !== "false") {
    startRedemptionWorker();
  }
});
