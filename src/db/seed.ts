import { pool } from "./connection.js";
import { migrate } from "./migrate.js";

const SEED = `
-- Clean slate (order matters due to foreign keys)
TRUNCATE redemptions, transactions, rewards, users CASCADE;

-- Demo user with starting points
INSERT INTO users (id, name, email, points_balance) VALUES
  ('usr_demo001', 'Oliver Demo', 'oliver@demo.com', 0);

-- Rewards catalog
INSERT INTO rewards (id, name, description, points_cost, stock, image_url) VALUES
  ('rwd_coffee',   'Free Coffee',              'A fresh brew from our partner cafe',          100,  50, '/rewards/coffee.svg'),
  ('rwd_tshirt',   'Brand T-Shirt',            'Premium cotton tee with the logo',            250,  30, '/rewards/tshirt.svg'),
  ('rwd_headset',  'Wireless Headset',          'Noise-cancelling over-ear headphones',        500,  15, '/rewards/headset.svg'),
  ('rwd_voucher',  '$25 Gift Card',             'Digital gift card for partner stores',         750,  20, '/rewards/voucher.svg'),
  ('rwd_backpack', 'Premium Backpack',           'Water-resistant laptop backpack',            1000,  10, '/rewards/backpack.svg'),
  ('rwd_laptop',   'Laptop Upgrade Voucher',     '$500 credit toward a new laptop',           2500,   3, '/rewards/laptop.svg');

-- Give the demo user 1500 starting points via a completed earn transaction.
-- The trigger will auto-set points_balance to 1500.
INSERT INTO transactions (id, user_id, type, points, description, status) VALUES
  ('txn_seed001', 'usr_demo001', 'earn', 1500, 'Welcome bonus', 'completed');
`;

async function seed() {
  console.log("Running migrations first...");
  await migrate();

  console.log("Seeding database...");
  await pool.query(SEED);

  // Verify
  const { rows } = await pool.query(
    "SELECT name, points_balance FROM users WHERE id = 'usr_demo001'"
  );
  console.log(`Seeded user: ${rows[0].name} with ${rows[0].points_balance} points`);
  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
