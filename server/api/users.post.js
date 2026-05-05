import { defineEventHandler, readBody } from "h3";
import { query } from "../db/index.js";

/**
 * POST /api/users
 * Creates or retrieves a user. Used for identifying the client.
 * Body: { id? } - if id is provided, ensures that user exists; otherwise creates new.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { id } = body || {};

  try {
    if (id) {
      // Check if user exists, create if not
      const result = await query(
        `INSERT INTO users (id) VALUES ($1)
         ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
         RETURNING id, created_at`,
        [id]
      );
      return { user: { id: result.rows[0].id, createdAt: result.rows[0].created_at } };
    } else {
      // Create new user
      const result = await query(
        `INSERT INTO users DEFAULT VALUES RETURNING id, created_at`
      );
      return { user: { id: result.rows[0].id, createdAt: result.rows[0].created_at } };
    }
  } catch (error) {
    console.error("[API] Error creating user:", error);
    event.node.res.statusCode = 500;
    return { error: "Failed to create user" };
  }
});
