-- Migration: onboarding & engagement bot — 4 new tables (spec 001).
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-03-onboarding.sql
--
-- Idempotent. Safe to re-run.

BEGIN;

-- 1. account_extras — per-account onboarding settings (FK to roles via email).
--    KHÔNG alter `roles` để giữ table đó focused on RBAC.
CREATE TABLE IF NOT EXISTS account_extras (
  email                   TEXT PRIMARY KEY REFERENCES roles(email) ON DELETE CASCADE,
  timezone                TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  work_hours_start        TEXT NOT NULL DEFAULT '08:30',     -- HH:MM
  work_hours_end          TEXT NOT NULL DEFAULT '18:00',
  level                   TEXT NOT NULL DEFAULT 'entry'      -- entry | mid | senior
                          CHECK (level IN ('entry','mid','senior')),
  onboarding_bot_enabled  BOOLEAN NOT NULL DEFAULT false,
  popup_ratio_override    JSONB,                              -- {motivation:2, check_in:2, humor:1} or null
  is_on_leave             BOOLEAN NOT NULL DEFAULT false,
  leave_until             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_extras_active_idx
  ON account_extras (onboarding_bot_enabled, is_on_leave)
  WHERE onboarding_bot_enabled = true AND is_on_leave = false;

-- 2. daily_popup — schedule + delivery + encrypted response.
CREATE TABLE IF NOT EXISTS daily_popup (
  id                       BIGSERIAL PRIMARY KEY,
  email                    TEXT NOT NULL REFERENCES roles(email) ON DELETE CASCADE,
  type                     TEXT NOT NULL CHECK (type IN ('motivation','check_in','humor')),
  content_text             TEXT NOT NULL,                  -- popup question/message
  humor_correct_option     TEXT,                            -- only for type=humor; "A".."D"
  scheduled_at             TIMESTAMPTZ NOT NULL,
  sent_at                  TIMESTAMPTZ,
  response_text_encrypted  BYTEA,                           -- libsodium secretbox ciphertext
  response_nonce           BYTEA,                           -- 24 bytes
  response_flag            TEXT CHECK (response_flag IN ('responded','ignored','dismissed')),
  responded_at             TIMESTAMPTZ,
  humor_user_answer        TEXT,                            -- "A".."D" choice — not encrypted (just a letter)
  humor_correct            BOOLEAN,                         -- computed at respond time
  humor_reported_bad       BOOLEAN NOT NULL DEFAULT false,
  purge_after              TIMESTAMPTZ NOT NULL,            -- scheduled_at + 12 months
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_popup_scheduled_idx
  ON daily_popup (email, scheduled_at);
CREATE INDEX IF NOT EXISTS daily_popup_pending_idx
  ON daily_popup (scheduled_at)
  WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS daily_popup_aggregate_idx
  ON daily_popup (sent_at, response_flag);
CREATE INDEX IF NOT EXISTS daily_popup_purge_idx
  ON daily_popup (purge_after)
  WHERE response_text_encrypted IS NOT NULL;

-- 3. focus_evaluation — periodic (weekly/monthly) score per email.
CREATE TABLE IF NOT EXISTS focus_evaluation (
  id                        BIGSERIAL PRIMARY KEY,
  email                     TEXT NOT NULL REFERENCES roles(email) ON DELETE CASCADE,
  period_kind               TEXT NOT NULL CHECK (period_kind IN ('week','month')),
  period_label              TEXT NOT NULL,                  -- "2026-W18" | "2026-04"
  assignments_pass_pct      REAL NOT NULL DEFAULT 0,        -- 0..1
  popup_response_rate       REAL NOT NULL DEFAULT 0,        -- 0..1
  humor_accuracy            REAL NOT NULL DEFAULT 0,        -- 0..1, null-coalesced to 0
  focus_score               REAL NOT NULL DEFAULT 0,        -- 0..100
  is_low                    BOOLEAN NOT NULL DEFAULT false, -- focus_score < 60
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT focus_evaluation_unique_period UNIQUE (email, period_kind, period_label)
);
CREATE INDEX IF NOT EXISTS focus_evaluation_low_idx
  ON focus_evaluation (period_kind, period_label, is_low)
  WHERE is_low = true;

-- 4. account_crypto_key — per-account DEK (envelope-encrypted by master).
CREATE TABLE IF NOT EXISTS account_crypto_key (
  email           TEXT PRIMARY KEY REFERENCES roles(email) ON DELETE CASCADE,
  dek_encrypted   BYTEA NOT NULL,                          -- master(secretbox(dek))
  dek_nonce       BYTEA NOT NULL,                          -- 24 bytes
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at      TIMESTAMPTZ
);

-- 5. updated_at auto-trigger cho account_extras (existing pattern in repo).
CREATE OR REPLACE FUNCTION onboarding_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS account_extras_updated_at ON account_extras;
CREATE TRIGGER account_extras_updated_at
  BEFORE UPDATE ON account_extras
  FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();

COMMIT;
