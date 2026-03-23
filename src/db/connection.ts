import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// pg.Pool manages a pool of connections to Postgres.
// Instead of opening/closing a connection per request (slow),
// the pool keeps a set of connections alive and hands them out
// as needed. When a query finishes, the connection goes back
// to the pool - not closed.
//
// max: 20 means at most 20 concurrent connections.
// Neon free tier allows 100, but we keep it modest.

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Healthcheck helper - used by the /health endpoint
export async function checkDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
