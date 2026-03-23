import { Router } from "express";
import {
  listActiveRewards,
  listAllRewards,
  getRewardById,
} from "../db/queries-rewards.js";
import { ok, fail } from "../lib/utils.js";

export const rewardsRouter = Router();

// GET /api/rewards - public catalog (SSR-friendly)
// Only active rewards with stock > 0, sorted by cost.
// The Next.js page will call this at request time for SSR,
// which means the HTML sent to the browser already contains
// the rewards data = great for SEO.
rewardsRouter.get("/", async (_req, res) => {
  const rewards = await listActiveRewards();
  res.json(ok(rewards));
});

// GET /api/rewards/all - admin view (includes inactive/out of stock)
rewardsRouter.get("/all", async (_req, res) => {
  const rewards = await listAllRewards();
  res.json(ok(rewards));
});

// GET /api/rewards/:id
rewardsRouter.get("/:id", async (req, res) => {
  const id = req.params.id as string;
  const reward = await getRewardById(id);

  if (!reward) {
    res.status(404).json(fail("Reward not found"));
    return;
  }

  res.json(ok(reward));
});
