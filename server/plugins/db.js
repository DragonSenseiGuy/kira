import { runMigrations } from "../db/migrate.js";

/**
 * Nitro plugin that initializes the database on server start.
 * Runs migrations automatically if DATABASE_URL is configured.
 */
export default defineNitroPlugin(async () => {
  const databaseUrl = process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;

  if (!databaseUrl) {
    console.log("[DB] No DATABASE_URL configured - PostgreSQL sync disabled");
    return;
  }

  try {
    await runMigrations();
    console.log("[DB] PostgreSQL database initialized successfully");
  } catch (error) {
    console.error("[DB] Failed to initialize database:", error.message);
    console.error("[DB] The server will continue but cloud sync will not work");
  }
});
