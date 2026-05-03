-- Migration: onboarding phase 2 — weekly_assignment + knowledge_task tables.
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-03-onboarding-phase2.sql
-- Idempotent. Safe to re-run.

BEGIN;

-- 1. weekly_assignment — per-account assignment tuần (Story 1).
CREATE TABLE IF NOT EXISTS weekly_assignment (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL REFERENCES roles(email) ON DELETE CASCADE,
  week_iso        TEXT NOT NULL,            -- "2026-W18"
  training_slug   TEXT NOT NULL,            -- reference knowledge/training.json path slug
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','in_progress','submitted','pending_retry',
                                    'failed_pending_review','passed','expired',
                                    'closed_ok','closed_supplement')),
  attempt_count   INT NOT NULL DEFAULT 0,
  last_score      REAL,
  admin_decision  TEXT CHECK (admin_decision IN ('ok','request_supplement','expired')),
  admin_email     TEXT,
  admin_decided_at TIMESTAMPTZ,
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  retry_submitted_at TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  CONSTRAINT weekly_assignment_unique UNIQUE (email, week_iso, training_slug)
);
CREATE INDEX IF NOT EXISTS weekly_assignment_status_idx
  ON weekly_assignment (status, week_iso);
CREATE INDEX IF NOT EXISTS weekly_assignment_email_idx
  ON weekly_assignment (email, week_iso DESC);

-- 2. knowledge_task — admin/lead request AI draft new doc (Story 3).
CREATE TABLE IF NOT EXISTS knowledge_task (
  id                       BIGSERIAL PRIMARY KEY,
  created_by_email         TEXT NOT NULL REFERENCES roles(email) ON DELETE SET NULL,
  created_by_role          TEXT NOT NULL CHECK (created_by_role IN ('admin','lead')),
  topic                    TEXT NOT NULL,
  audience                 TEXT[] NOT NULL,                 -- {employee, lead, ...}
  level                    TEXT CHECK (level IN ('entry','mid','senior')),
  deadline                 TIMESTAMPTZ NOT NULL,
  level_based              BOOLEAN NOT NULL DEFAULT false,
  status                   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','drafting','pr_open',
                                             'merged','ingested','assigned')),
  related_assignment_id    BIGINT REFERENCES weekly_assignment(id) ON DELETE SET NULL,
  pr_url                   TEXT,
  drafting_started_at      TIMESTAMPTZ,
  pr_opened_at             TIMESTAMPTZ,
  merged_at                TIMESTAMPTZ,
  ingested_at              TIMESTAMPTZ,
  escalated_at             TIMESTAMPTZ,
  escalated_to_email       TEXT REFERENCES roles(email) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_task_status_idx
  ON knowledge_task (status, deadline);
CREATE INDEX IF NOT EXISTS knowledge_task_created_by_idx
  ON knowledge_task (created_by_email);

COMMIT;
