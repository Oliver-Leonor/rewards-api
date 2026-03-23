import { pool } from "./connection.js";
import type { Reward } from "../types/domain.js";

function toReward(row: Record<string, unknown>): Reward {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    pointsCost: row.points_cost as number,
    stock: row.stock as number,
    imageUrl: row.image_url as string,
    isActive: row.is_active as boolean,
    createdAtISO: (row.created_at as Date).toISOString(),
  };
}

// Public catalog - only active rewards with stock remaining
export async function listActiveRewards(): Promise<Reward[]> {
  const { rows } = await pool.query(
    `SELECT * FROM rewards
     WHERE is_active = true AND stock > 0
     ORDER BY points_cost ASC`
  );
  return rows.map(toReward);
}

// Admin view - everything
export async function listAllRewards(): Promise<Reward[]> {
  const { rows } = await pool.query(
    "SELECT * FROM rewards ORDER BY created_at DESC"
  );
  return rows.map(toReward);
}

export async function getRewardById(id: string): Promise<Reward | null> {
  const { rows } = await pool.query("SELECT * FROM rewards WHERE id = $1", [
    id,
  ]);
  return rows[0] ? toReward(rows[0]) : null;
}

// Decrement stock atomically. Returns false if out of stock.
// The WHERE stock > 0 prevents overselling even under concurrency.
export async function decrementRewardStock(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE rewards SET stock = stock - 1
     WHERE id = $1 AND stock > 0`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}
