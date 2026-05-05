import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Run database migrations (creates tables if they don't exist)
 */
export async function runMigrations() {
  const pool = getPool();
  const schema = readFileSync(resolve(__dirname, "schema.sql"), "utf-8");

  try {
    await pool.query(schema);
    console.log("[DB] Migrations completed successfully");
  } catch (error) {
    console.error("[DB] Migration error:", error);
    throw error;
  }
}
