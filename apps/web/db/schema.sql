-- Local Life Asia — Postgres schema.
-- Idempotent: safe to re-run. Apply: psql $DATABASE_URL -f apps/web/db/schema.sql

CREATE TABLE IF NOT EXISTS roles (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('employee', 'lead', 'admin')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mọi tương tác có citation/side-effect lưu vào đây. Phase 3 governance.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_email TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,            -- 'chat' | 'draft_update' | 'commit_update' | 'upload'
  doc_id TEXT,                     -- ULID doc nếu có
  query TEXT,                      -- câu hỏi user (nếu action=chat)
  answer_excerpt TEXT,             -- 500 ký tự đầu của câu trả lời
  citations TEXT[],                -- list file#heading
  tool_calls JSONB,                -- tool name + input + output summary
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_email, ts DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, ts DESC);

-- Câu hỏi retrieval không match → đề xuất doc cần viết. Phase 4 analytics.
CREATE TABLE IF NOT EXISTS unmatched_queries (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  query TEXT NOT NULL,
  actor_email TEXT,
  role TEXT
);
CREATE INDEX IF NOT EXISTS unmatched_queries_ts_idx ON unmatched_queries (ts DESC);
