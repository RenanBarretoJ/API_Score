import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[FATAL] DATABASE_URL não configurada");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
