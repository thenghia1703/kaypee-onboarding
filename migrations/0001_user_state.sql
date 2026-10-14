CREATE TABLE IF NOT EXISTS kaypee_sessions (
  token_hash TEXT PRIMARY KEY,
  user_sub TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kaypee_sessions_expiry ON kaypee_sessions(expires_at);

CREATE TABLE IF NOT EXISTS kaypee_user_state (
  user_sub TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
