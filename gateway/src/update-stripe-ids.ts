import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await pool.query(`UPDATE credit_packs SET stripe_price_id = 'price_1TDddWRtZhV0zWIN7I3zuptD'  WHERE id = 'pack10'`);
  await pool.query(`UPDATE credit_packs SET stripe_price_id = 'price_1TDddWRtZhV0zWINBf3q96eo' WHERE id = 'pack50'`);
  await pool.query(`UPDATE credit_packs SET stripe_price_id = 'price_1TDddWRtZhV0zWINasFmf8mm' WHERE id = 'pack100'`);

  const { rows } = await pool.query(`SELECT id, name, credits, price_reais, stripe_price_id FROM credit_packs ORDER BY credits`);
  console.log("\n✅ Price IDs atualizados:");
  rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${r.credits} créditos | ${r.stripe_price_id}`));
  await pool.end();
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
