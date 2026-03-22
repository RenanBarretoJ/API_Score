/**
 * Cria as novas tabelas no banco sem usar drizzle-kit push interativo.
 * Uso: npx tsx src/migrate.ts
 */
import "dotenv/config";
import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("supabase.com") ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("Aplicando migrações...");

    // 1. Coluna company em clients
    await client.query(`
      ALTER TABLE clients
        ADD COLUMN IF NOT EXISTS company VARCHAR(256),
        ADD COLUMN IF NOT EXISTS credits INTEGER NOT NULL DEFAULT 0
    `);
    console.log("✅ clients: company + credits");

    // 2. Plano credits
    await client.query(`
      INSERT INTO plans (id, name, monthly_quota)
      VALUES ('credits', 'Créditos', 0)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✅ plans: plano credits");

    // 3. Tabela credit_packs
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_packs (
        id            VARCHAR(32) PRIMARY KEY,
        name          VARCHAR(128) NOT NULL,
        credits       INTEGER NOT NULL,
        price_reais   INTEGER NOT NULL,
        stripe_price_id VARCHAR(128),
        active        BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);
    await client.query(`
      INSERT INTO credit_packs (id, name, credits, price_reais) VALUES
        ('starter',      'Starter',      100,  4500),
        ('professional', 'Professional', 500,  19000),
        ('enterprise',   'Enterprise',   2000, 65000)
      ON CONFLICT (id) DO NOTHING
    `);
    console.log("✅ credit_packs");

    // 4. Tabela credit_transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id        UUID NOT NULL REFERENCES clients(id),
        type             VARCHAR(16) NOT NULL,
        credits          INTEGER NOT NULL,
        balance_after    INTEGER NOT NULL,
        description      VARCHAR(256),
        stripe_session_id VARCHAR(128),
        pack_id          VARCHAR(32),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS credit_tx_client_idx
        ON credit_transactions (client_id, created_at DESC)
    `);
    console.log("✅ credit_transactions");

    console.log("\n🎉 Migrações aplicadas com sucesso!");
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

migrate().catch((e) => {
  console.error("❌ Erro na migração:", e.message);
  process.exit(1);
});
