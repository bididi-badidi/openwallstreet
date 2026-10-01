CREATE TABLE IF NOT EXISTS reception_sessions (
  id TEXT PRIMARY KEY, ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL DEFAULT (unixepoch()+86400), turns INTEGER NOT NULL DEFAULT 0,
  busy_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reception_sessions_ip ON reception_sessions(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS reception_turns (
  session_id TEXT NOT NULL REFERENCES reception_sessions(id) ON DELETE CASCADE,
  id TEXT NOT NULL, input TEXT NOT NULL, response TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(session_id,id)
);
CREATE TABLE IF NOT EXISTS access_codes (
  code_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL UNIQUE, ip_hash TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses BETWEEN 0 AND 2),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), expires_at INTEGER NOT NULL DEFAULT (unixepoch()+86400)
);
CREATE INDEX IF NOT EXISTS access_codes_ip ON access_codes(ip_hash,created_at);
CREATE TABLE IF NOT EXISTS job_access (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, code_hash TEXT
);
CREATE TRIGGER IF NOT EXISTS consume_access_code AFTER INSERT ON job_access
WHEN NEW.code_hash IS NOT NULL
BEGIN
  UPDATE access_codes SET uses=uses+1 WHERE code_hash=NEW.code_hash;
END;
CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL, ip_hash TEXT NOT NULL,
  name TEXT NOT NULL, reply_to TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sending','sent','failed','unknown')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), provider_id TEXT
);
CREATE INDEX IF NOT EXISTS contact_messages_ip ON contact_messages(ip_hash,created_at);
