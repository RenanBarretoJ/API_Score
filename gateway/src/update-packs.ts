import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await pool.query(`
    INSERT INTO credit_packs (id, name, credits, price_reais) VALUES
      ('pack10',  'Pack 10 Consultas',   10,  12000),
      ('pack50',  'Pack 50 Consultas',   50,  57000),
      ('pack100', 'Pack 100 Consultas', 100, 108000)
    ON CONFLICT (id) DO UPDATE SET
      name        = EXCLUDED.name,
      credits     = EXCLUDED.credits,
      price_reais = EXCLUDED.price_reais
  `);
  await pool.query(`DELETE FROM credit_packs WHERE id IN ('starter','professional','enterprise')`);
  console.log("✅ Pacotes atualizados para R$ 12/crédito");
  await pool.end();
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
