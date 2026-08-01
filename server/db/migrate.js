import { getPool } from "./index.js";
import { SCHEMA_SQL } from "./schema.js";

/**
 * Applies the schema (creates tables/indexes if they don't exist).
 */
export async function runMigrations() {
  const pool = getPool();

  try {
    await pool.query(SCHEMA_SQL);
    console.log("[DB] Migrations completed successfully");
  } catch (error) {
    console.error("[DB] Migration error:", error);
    throw error;
  }
}
