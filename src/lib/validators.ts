import { z } from "zod";

// ── Earn points (webhook from a purchase system) ──
// In production, this webhook would come from Stripe/Shopify/etc.
// For our demo, the frontend will call it directly.

export const earnPointsSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  points: z.number().int().positive("points must be a positive integer"),
  description: z.string().min(1, "description is required"),
});

export type EarnPointsInput = z.infer<typeof earnPointsSchema>;

// ── Redeem a reward ──

export const redeemRewardSchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;

// ── Create user (for demo/seeding) ──

export const createUserSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
