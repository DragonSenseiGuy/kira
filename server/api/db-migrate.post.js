import { defineEventHandler } from "h3";
import { runMigrations } from "../db/migrate.js";

/**
 * POST /api/db-migrate
 * Runs database migrations. Should be called once on deployment or setup.
 * In production, you'd protect this with an admin key.
 */
export default defineEventHandler(async (event) => {
  try {
    await runMigrations();
    return { success: true, message: "Migrations completed successfully" };
  } catch (error) {
    console.error("[API] Migration error:", error);
    event.node.res.statusCode = 500;
    return { error: "Migration failed", details: error.message };
  }
});
