import pg from "pg";

const { Pool } = pg;

let pool = null;

/**
 * Returns the configured PostgreSQL connection string, or null when the app
 * is running in local-only mode.
 * @returns {string|null}
 */
export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL || null;
}

/**
 * True when a database is configured, which is what enables accounts and
 * cloud-synced chats. Without it the app stays local-only (IndexedDB).
 * @returns {boolean}
 */
export function isDatabaseConfigured() {
  return !!getDatabaseUrl();
}

/**
 * Returns a singleton PostgreSQL connection pool.
 */
export function getPool() {
  if (!pool) {
    const databaseUrl = getDatabaseUrl();

    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL is not configured. Set it in environment variables or nuxt.config runtimeConfig."
      );
    }

    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client", err);
    });
  }

  return pool;
}

/**
 * Helper to run a single query
 */
export async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

/**
 * Helper to get a client for transactions
 */
export async function getClient() {
  const pool = getPool();
  return pool.connect();
}
