/**
 * Database schema for Kira, kept as a JS module so it is bundled into the
 * Nitro server build (a plain .sql file would not survive bundling).
 * Every statement is idempotent and re-applied on each server start.
 */
export const SCHEMA_SQL = `
-- Kira Chat Database Schema
-- Applied automatically on server start (server/plugins/db.js) when
-- DATABASE_URL is configured. Every statement is idempotent.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Accounts. Passwords are never stored in the clear: password_hash holds a
-- salted scrypt digest produced by server/utils/password.js.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emails are matched case-insensitively, so uniqueness has to be too.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  branch_path JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_updated ON conversations(last_updated DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT,
  timestamp TIMESTAMPTZ,
  complete BOOLEAN DEFAULT TRUE,
  -- Branching metadata
  parent_id VARCHAR(255),
  branch_index INTEGER NOT NULL DEFAULT 0,
  -- User message fields
  attachments JSONB,
  -- Assistant message fields
  reasoning TEXT,
  reasoning_start_time DOUBLE PRECISION,
  reasoning_end_time DOUBLE PRECISION,
  reasoning_duration DOUBLE PRECISION,
  tool_calls JSONB,
  api_call_time DOUBLE PRECISION,
  first_token_time DOUBLE PRECISION,
  completion_time DOUBLE PRECISION,
  token_count INTEGER,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  annotations JSONB,
  parts JSONB,
  -- Tool message fields
  tool_call_id VARCHAR(255),
  tool_name VARCHAR(255),
  -- Ordering
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Message ids are only unique within a conversation
  PRIMARY KEY (conversation_id, id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_position ON messages(conversation_id, position);
`;
