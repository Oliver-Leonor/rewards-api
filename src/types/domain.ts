// ── Enums as string unions (same pattern as MemberTier in proto-community-hub) ──

export type TransactionType = "earn" | "redeem";

export type TransactionStatus = "pending" | "completed" | "failed";

export type RedemptionStatus = "queued" | "processing" | "fulfilled" | "failed";

// ── Domain entities ──

export type User = {
  id: string;
  name: string;
  email: string;
  pointsBalance: number;
  createdAtISO: string;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  stock: number;
  imageUrl: string;
  isActive: boolean;
  createdAtISO: string;
};

export type Transaction = {
  id: string;
  userId: string;
  type: TransactionType;
  points: number;
  description: string;
  rewardId: string | null;
  status: TransactionStatus;
  createdAtISO: string;
};

export type Redemption = {
  id: string;
  userId: string;
  rewardId: string;
  transactionId: string;
  status: RedemptionStatus;
  fulfilledAtISO: string | null;
  createdAtISO: string;
};
