import { Router } from "express";
import { getUserById } from "../db/queries-users.js";
import { getRewardById, decrementRewardStock } from "../db/queries-rewards.js";
import {
  createEarnTransaction,
  createRedemption,
  listUserTransactions,
  listUserRedemptions,
  getStats,
} from "../db/queries-transactions.js";
import { validate } from "../middleware/validate.js";
import { earnPointsSchema, redeemRewardSchema } from "../lib/validators.js";
import { generateId, ok, fail } from "../lib/utils.js";
import { enqueueRedemption } from "../workers/redemption-queue.js";

export const transactionsRouter = Router();

// ─────────────────────────────────────────────
// POST /api/events/purchase - Earn points
// ─────────────────────────────────────────────
// Simulates a purchase webhook. In production, this would come
// from Stripe/Shopify with a signature verification step.
// For the demo, the frontend calls it directly.
//
// Flow: validate → check user exists → create completed txn → done
// The DB trigger auto-updates the user's points_balance.

transactionsRouter.post(
  "/events/purchase",
  validate(earnPointsSchema),
  async (req, res) => {
    const { userId, points, description } = req.body;

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json(fail("User not found"));
      return;
    }

    const txnId = generateId("txn");
    const transaction = await createEarnTransaction(
      txnId,
      userId,
      points,
      description
    );

    // Fetch updated user to get new balance (trigger already ran)
    const updatedUser = await getUserById(userId);

    res.status(201).json(
      ok({
        transaction,
        newBalance: updatedUser?.pointsBalance ?? 0,
      })
    );
  }
);

// ─────────────────────────────────────────────
// POST /api/rewards/:rewardId/redeem - Redeem
// ─────────────────────────────────────────────
// This is the most complex endpoint. Steps:
// 1. Validate the request body
// 2. Check user exists and has enough points
// 3. Check reward exists, is active, and has stock
// 4. Atomically create transaction + redemption (DB transaction)
// 5. Decrement reward stock (atomic WHERE stock > 0)
// 6. Enqueue BullMQ job for async fulfillment
// 7. Return the pending redemption to the frontend
//
// The frontend shows "Processing..." immediately. The BullMQ
// worker will eventually mark it as fulfilled or failed.

transactionsRouter.post(
  "/rewards/:rewardId/redeem",
  validate(redeemRewardSchema),
  async (req, res) => {
    // Express 5 types params as string | string[] to handle wildcard routes.
    // We know this is always a single string from our route definition,
    // so we assert it. In a larger app, you'd make a typed params middleware.
    const rewardId = req.params.rewardId as string;
    const { userId } = req.body;

    // Step 2: Check user
    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json(fail("User not found"));
      return;
    }

    // Step 3: Check reward
    const reward = await getRewardById(rewardId);
    if (!reward) {
      res.status(404).json(fail("Reward not found"));
      return;
    }
    if (!reward.isActive) {
      res.status(400).json(fail("Reward is no longer available"));
      return;
    }
    if (reward.stock <= 0) {
      res.status(400).json(fail("Reward is out of stock"));
      return;
    }
    if (user.pointsBalance < reward.pointsCost) {
      res.status(400).json(
        fail(
          `Insufficient points. Need ${reward.pointsCost}, have ${user.pointsBalance}`
        )
      );
      return;
    }

    // Step 4: Create transaction + redemption atomically
    const txnId = generateId("txn");
    const redemptionId = generateId("red");

    const { transaction, redemption } = await createRedemption(
      txnId,
      redemptionId,
      userId,
      rewardId,
      reward.pointsCost,
      `Redeemed: ${reward.name}`
    );

    // Step 5: Decrement stock
    const stockOk = await decrementRewardStock(rewardId);
    if (!stockOk) {
      // Edge case: stock ran out between our check and now.
      // The transaction is already created but pending - the worker
      // will handle marking it as failed.
      res.status(409).json(fail("Reward just went out of stock"));
      return;
    }

    // Step 6: Enqueue async fulfillment job
    await enqueueRedemption({
      redemptionId: redemption.id,
      transactionId: transaction.id,
      userId,
      rewardId,
      rewardName: reward.name,
    });

    // Step 7: Return immediately (don't wait for fulfillment)
    res.status(202).json(
      ok({
        transaction,
        redemption,
        message: "Redemption queued for fulfillment",
      })
    );
  }
);

// ─────────────────────────────────────────────
// GET /api/users/:userId/transactions
// ─────────────────────────────────────────────
transactionsRouter.get("/users/:userId/transactions", async (req, res) => {
  const userId = req.params.userId as string;
  const transactions = await listUserTransactions(userId);
  res.json(ok(transactions));
});

// ─────────────────────────────────────────────
// GET /api/users/:userId/redemptions
// ─────────────────────────────────────────────
transactionsRouter.get("/users/:userId/redemptions", async (req, res) => {
  const userId = req.params.userId as string;
  const redemptions = await listUserRedemptions(userId);
  res.json(ok(redemptions));
});

// ─────────────────────────────────────────────
// GET /api/admin/dashboard
// ─────────────────────────────────────────────
transactionsRouter.get("/admin/dashboard", async (_req, res) => {
  const stats = await getStats();
  res.json(ok(stats));
});
