import pg from "pg";

const { Pool } = pg;

let pool = null;

/**
 * Returns a singleton PostgreSQL connection pool.
 * Reads DATABASE_URL from runtime config or environment.
 */
export function getPool() {
  if (!pool) {
    const databaseUrl =
      process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;

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
