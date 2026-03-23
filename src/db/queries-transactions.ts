import { pool } from "./connection.js";
import type { Transaction, Redemption } from "../types/domain.js";

// ── Mappers ──

function toTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as Transaction["type"],
    points: row.points as number,
    description: row.description as string,
    rewardId: (row.reward_id as string) ?? null,
    status: row.status as Transaction["status"],
    createdAtISO: (row.created_at as Date).toISOString(),
  };
}

function toRedemption(row: Record<string, unknown>): Redemption {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    rewardId: row.reward_id as string,
    transactionId: row.transaction_id as string,
    status: row.status as Redemption["status"],
    fulfilledAtISO: row.fulfilled_at
      ? (row.fulfilled_at as Date).toISOString()
      : null,
    createdAtISO: (row.created_at as Date).toISOString(),
  };
}

// ── Transaction queries ──

export async function listUserTransactions(
  userId: string,
  limit = 50,
  offset = 0
): Promise<Transaction[]> {
  const { rows } = await pool.query(
    `SELECT * FROM transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows.map(toTransaction);
}

// Earn points - created as 'completed' immediately because
// earning doesn't need async fulfillment. The DB trigger will
// auto-update the user's points_balance.
export async function createEarnTransaction(
  id: string,
  userId: string,
  points: number,
  description: string
): Promise<Transaction> {
  const { rows } = await pool.query(
    `INSERT INTO transactions (id, user_id, type, points, description, status)
     VALUES ($1, $2, 'earn', $3, $4, 'completed')
     RETURNING *`,
    [id, userId, points, description]
  );
  return toTransaction(rows[0]);
}

// Redeem points - this is a two-step atomic operation:
// 1. Create a 'pending' transaction (points deducted after fulfillment)
// 2. Create a 'queued' redemption (BullMQ will process this)
// Both happen inside a DB transaction so they succeed or fail together.
export async function createRedemption(
  txnId: string,
  redemptionId: string,
  userId: string,
  rewardId: string,
  points: number,
  description: string
): Promise<{ transaction: Transaction; redemption: Redemption }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: txnRows } = await client.query(
      `INSERT INTO transactions (id, user_id, type, points, description, reward_id, status)
       VALUES ($1, $2, 'redeem', $3, $4, $5, 'pending')
       RETURNING *`,
      [txnId, userId, points, description, rewardId]
    );

    const { rows: redRows } = await client.query(
      `INSERT INTO redemptions (id, user_id, reward_id, transaction_id, status)
       VALUES ($1, $2, $3, $4, 'queued')
       RETURNING *`,
      [redemptionId, userId, rewardId, txnId]
    );

    await client.query("COMMIT");

    return {
      transaction: toTransaction(txnRows[0]),
      redemption: toRedemption(redRows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Redemption queries ──

export async function listUserRedemptions(
  userId: string
): Promise<Redemption[]> {
  const { rows } = await pool.query(
    `SELECT * FROM redemptions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(toRedemption);
}

// Used by the BullMQ worker to update redemption status
export async function updateRedemptionStatus(
  redemptionId: string,
  status: Redemption["status"]
): Promise<Redemption | null> {
  const fulfilledClause =
    status === "fulfilled" ? ", fulfilled_at = now()" : "";

  const { rows } = await pool.query(
    `UPDATE redemptions
     SET status = $1 ${fulfilledClause}
     WHERE id = $2
     RETURNING *`,
    [status, redemptionId]
  );
  return rows[0] ? toRedemption(rows[0]) : null;
}

// Used by the BullMQ worker to finalize the transaction
export async function updateTransactionStatus(
  txnId: string,
  status: Transaction["status"]
): Promise<Transaction | null> {
  const { rows } = await pool.query(
    `UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *`,
    [status, txnId]
  );
  return rows[0] ? toTransaction(rows[0]) : null;
}

// Admin dashboard stats
export async function getStats(): Promise<{
  totalUsers: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  totalRedemptions: number;
  pendingRedemptions: number;
}> {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users)::int AS total_users,
      (SELECT COALESCE(SUM(points), 0) FROM transactions WHERE type = 'earn' AND status = 'completed')::int AS total_points_earned,
      (SELECT COALESCE(SUM(points), 0) FROM transactions WHERE type = 'redeem' AND status = 'completed')::int AS total_points_redeemed,
      (SELECT COUNT(*) FROM redemptions)::int AS total_redemptions,
      (SELECT COUNT(*) FROM redemptions WHERE status IN ('queued', 'processing'))::int AS pending_redemptions
  `);

  const r = rows[0];
  return {
    totalUsers: r.total_users,
    totalPointsEarned: r.total_points_earned,
    totalPointsRedeemed: r.total_points_redeemed,
    totalRedemptions: r.total_redemptions,
    pendingRedemptions: r.pending_redemptions,
  };
}
