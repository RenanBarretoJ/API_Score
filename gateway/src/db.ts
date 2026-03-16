import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[FATAL] DATABASE_URL não configurada. Defina a variável de ambiente DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString,
  ssl: connectionString.includes("supabase.com") ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[DB] Erro inesperado no pool de conexões:", err.message);
});

export const db = drizzle(pool, { schema });
