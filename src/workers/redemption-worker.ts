import { Worker, type Job } from "bullmq";
import { redisConnection } from "./redis.js";
import {
  updateRedemptionStatus,
  updateTransactionStatus,
} from "../db/queries-transactions.js";
import type { RedemptionJobData } from "./redemption-queue.js";

// ── The fulfillment worker ──
//
// This runs in the same process for simplicity, but in production
// you'd run it as a separate service:
//   node dist/workers/redemption-worker.js
//
// Why separate? If the API server gets high traffic, you don't want
// background job processing competing for the same CPU/memory.
// You can also scale workers independently (e.g., 2 API servers
// but 5 workers during a flash sale).

export function startRedemptionWorker() {
  const worker = new Worker<RedemptionJobData>(
    "reward-fulfillment",
    async (job: Job<RedemptionJobData>) => {
      const { redemptionId, transactionId, rewardName } = job.data;

      console.log(
        `[WORKER] Processing redemption ${redemptionId} for "${rewardName}"`
      );

      // Step 1: Mark as processing
      await updateRedemptionStatus(redemptionId, "processing");

      // Step 2: Simulate fulfillment work
      // In production, this is where you'd call the partner API:
      //   - Gift card provider: POST /api/issue-card
      //   - Shipping service: POST /api/create-shipment
      //   - Email service: POST /api/send-reward-email
      //
      // Each of these can fail, which is why we need retries.
      await simulateFulfillment();

      // Step 3: Mark transaction as completed
      // This triggers the DB function that recalculates the user's
      // points_balance (subtracting the redeemed points).
      await updateTransactionStatus(transactionId, "completed");

      // Step 4: Mark redemption as fulfilled
      await updateRedemptionStatus(redemptionId, "fulfilled");

      console.log(`[WORKER] Fulfilled redemption ${redemptionId}`);
    },
    {
      connection: redisConnection,
      // Process 3 jobs at a time. In production, you'd tune this
      // based on how heavy the fulfillment work is.
      concurrency: 3,
    }
  );

  // ── Error handling ──
  // 'failed' fires when all retries are exhausted.
  // At this point, we mark the redemption as failed so the
  // frontend can show an error and offer a retry option.

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { redemptionId, transactionId } = job.data;
    console.error(`[WORKER] Redemption ${redemptionId} FAILED:`, err.message);

    await updateRedemptionStatus(redemptionId, "failed");
    await updateTransactionStatus(transactionId, "failed");
  });

  worker.on("ready", () => {
    console.log("[WORKER] Redemption worker ready");
  });

  return worker;
}

// ── Simulate async fulfillment (1-3 second delay) ──

function simulateFulfillment(): Promise<void> {
  const delay = 1_000 + Math.random() * 2_000;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
