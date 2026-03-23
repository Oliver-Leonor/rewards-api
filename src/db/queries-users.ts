import { pool } from "./connection.js";
import type { User } from "../types/domain.js";

// ── Helpers ──
// Postgres returns snake_case columns. We map them to camelCase
// at the query boundary so the rest of the app uses clean types.

function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    pointsBalance: row.points_balance as number,
    createdAtISO: (row.created_at as Date).toISOString(),
  };
}

// ── Queries ──

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query(
    "SELECT * FROM users ORDER BY created_at DESC"
  );
  return rows.map(toUser);
}

export async function createUser(
  id: string,
  name: string,
  email: string
): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [id, name, email]
  );
  return toUser(rows[0]);
}
