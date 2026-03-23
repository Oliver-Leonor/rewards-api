import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

// The queue name is how producers and consumers find each other.
// Think of it like a named channel - the API pushes jobs into
// "reward-fulfillment", and the worker subscribes to that same name.

export const redemptionQueue = new Queue("reward-fulfillment", {
  connection: redisConnection,
  defaultJobOptions: {
    // If the worker throws an error, BullMQ retries up to 3 times.
    // The backoff is exponential: 1s, 2s, 4s. This handles
    // transient failures (network blips, partner API downtime).
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
    // Remove completed jobs after 24h, failed after 7 days.
    // This keeps Redis memory usage bounded.
    removeOnComplete: { age: 86_400 },
    removeOnFail: { age: 604_800 },
  },
});

// ── Types for the job payload ──

export type RedemptionJobData = {
  redemptionId: string;
  transactionId: string;
  userId: string;
  rewardId: string;
  rewardName: string;
};

// ── Producer function (called from the redeem route) ──

export async function enqueueRedemption(
  data: RedemptionJobData
): Promise<void> {
  await redemptionQueue.add("fulfill", data, {
    // jobId prevents duplicate processing if the API accidentally
    // enqueues the same redemption twice (idempotency).
    jobId: data.redemptionId,
  });

  console.log(`[QUEUE] Enqueued redemption ${data.redemptionId}`);
}
