import { pool } from "./connection.js";

const SCHEMA = `
-- =============================================
-- 1. USERS
-- =============================================
-- points_balance is a materialized cache of the transaction ledger.
-- We keep it here for fast reads, but the source of truth is the
-- transactions table. A trigger keeps them in sync.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  points_balance INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 2. REWARDS (the catalog)
-- =============================================
-- is_active lets us "soft delete" rewards without losing history.
-- stock is decremented on redemption.

CREATE TABLE IF NOT EXISTS rewards (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  points_cost   INTEGER NOT NULL CHECK (points_cost > 0),
  stock         INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url     TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- 3. TRANSACTIONS (the ledger - append only)
-- =============================================
-- This is the source of truth for points. Every earn and redeem
-- is a row here. We never UPDATE or DELETE rows in this table.
-- 
-- type: 'earn' = positive points, 'redeem' = negative points
-- status: tracks whether the operation completed successfully.

CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  type          TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
  points        INTEGER NOT NULL CHECK (points > 0),
  description   TEXT NOT NULL DEFAULT '',
  reward_id     TEXT REFERENCES rewards(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- =============================================
-- 4. REDEMPTIONS (async fulfillment tracking)
-- =============================================
-- When a user redeems points, we create both a transaction AND
-- a redemption. The redemption tracks the async fulfillment
-- process (queued -> processing -> fulfilled/failed).

CREATE TABLE IF NOT EXISTS redemptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  reward_id       TEXT NOT NULL REFERENCES rewards(id),
  transaction_id  TEXT NOT NULL REFERENCES transactions(id),
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'fulfilled', 'failed')),
  fulfilled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redemptions_user_id ON redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_status ON redemptions(status);

-- =============================================
-- 5. BALANCE SYNC TRIGGER
-- =============================================
-- After a transaction is marked 'completed', recalculate the
-- user's balance from all their completed transactions.
-- This ensures points_balance is always consistent with the ledger.

CREATE OR REPLACE FUNCTION sync_user_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET points_balance = (
    SELECT COALESCE(
      SUM(CASE WHEN type = 'earn' THEN points ELSE -points END),
      0
    )
    FROM transactions
    WHERE user_id = NEW.user_id AND status = 'completed'
  )
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_balance ON transactions;

CREATE TRIGGER trg_sync_balance
  AFTER INSERT OR UPDATE OF status ON transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION sync_user_balance();
`;

export async function migrate() {
  console.log("Running migrations...");
  await pool.query(SCHEMA);
  console.log("Migrations complete.");
}

// Run directly: npx tsx src/db/migrate.ts
const isDirectRun = process.argv[1]?.includes("migrate");
if (isDirectRun) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
