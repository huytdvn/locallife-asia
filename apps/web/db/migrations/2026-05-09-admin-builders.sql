-- Migration: admin builders — onboarding flow + training quiz tables.
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-09-admin-builders.sql
--
-- Idempotent. Safe to re-run.
--
-- Two related features:
--   1. Onboarding flows — admin tự thiết kế lộ trình onboarding (free type
--      hoặc AI-suggested), gồm steps có doc references + highlight đoạn cụ
--      thể + câu hỏi pass/fail. Khác `weekly_assignment` (which is per-week
--      single training file): onboarding flow là multi-step, có pass/fail
--      criteria, có thể assign theo user cụ thể HOẶC broadcast role.
--   2. Training quiz — admin chọn 1-N tài liệu → AI sinh quiz tự chấm.
--      Khác `training_progress` (which tracks file-based training in
--      /knowledge/training/): quiz là DB-stored, generated on-demand.

BEGIN;

-- ─── ONBOARDING FLOWS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS onboarding_flow (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  motto           TEXT,                          -- 1 câu hype hiển thị header khi user học
  brief           TEXT,                          -- ý tưởng gốc admin nhập
  created_by      TEXT NOT NULL REFERENCES roles(email) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
  pass_threshold  INT NOT NULL DEFAULT 70        -- % câu hỏi đúng để pass overall
                  CHECK (pass_threshold BETWEEN 0 AND 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onboarding_flow_status_idx
  ON onboarding_flow (status, created_at DESC);

CREATE TABLE IF NOT EXISTS onboarding_step (
  id              BIGSERIAL PRIMARY KEY,
  flow_id         BIGINT NOT NULL REFERENCES onboarding_flow(id) ON DELETE CASCADE,
  idx             INT NOT NULL,                  -- thứ tự trong flow (0-based)
  goal            TEXT NOT NULL,                 -- mục tiêu của step (1 câu)
  intro           TEXT,                          -- intro markdown ngắn
  pass_criteria   TEXT,                          -- vd "trả đúng ≥ 70% câu"
  CONSTRAINT onboarding_step_unique UNIQUE (flow_id, idx)
);
CREATE INDEX IF NOT EXISTS onboarding_step_flow_idx
  ON onboarding_step (flow_id, idx);

CREATE TABLE IF NOT EXISTS onboarding_step_doc (
  id              BIGSERIAL PRIMARY KEY,
  step_id         BIGINT NOT NULL REFERENCES onboarding_step(id) ON DELETE CASCADE,
  doc_path        TEXT NOT NULL,                 -- vd "knowledge/host/faq/abc.md"
  heading_anchor  TEXT,                          -- vd "tieu-de-h2" (slug from H2)
  highlight       TEXT,                          -- excerpt cần đọc
  reason          TEXT                           -- 1 câu vì sao link doc này
);
CREATE INDEX IF NOT EXISTS onboarding_step_doc_step_idx
  ON onboarding_step_doc (step_id);

CREATE TABLE IF NOT EXISTS onboarding_step_question (
  id                BIGSERIAL PRIMARY KEY,
  step_id           BIGINT NOT NULL REFERENCES onboarding_step(id) ON DELETE CASCADE,
  prompt            TEXT NOT NULL,
  expected_keywords TEXT[],                      -- chấm pass nếu chứa ≥ N keywords
  min_keywords      INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS onboarding_step_question_step_idx
  ON onboarding_step_question (step_id);

-- target_email XOR target_role — exactly one must be set.
CREATE TABLE IF NOT EXISTS onboarding_assignment (
  id            BIGSERIAL PRIMARY KEY,
  flow_id       BIGINT NOT NULL REFERENCES onboarding_flow(id) ON DELETE CASCADE,
  target_email  TEXT REFERENCES roles(email) ON DELETE CASCADE,
  target_role   TEXT CHECK (target_role IN ('employee','lead','admin','host','lok','guest')),
  assigned_by   TEXT NOT NULL REFERENCES roles(email) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_assignment_xor
    CHECK ((target_email IS NOT NULL) <> (target_role IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS onboarding_assignment_flow_idx
  ON onboarding_assignment (flow_id);
CREATE INDEX IF NOT EXISTS onboarding_assignment_email_idx
  ON onboarding_assignment (target_email);
CREATE INDEX IF NOT EXISTS onboarding_assignment_role_idx
  ON onboarding_assignment (target_role);

-- ─── TRAINING QUIZ ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS training_quiz (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  motto           TEXT,                          -- 1 câu hype
  intro           TEXT,                          -- giới thiệu ngắn về quiz
  audience        TEXT[] NOT NULL,               -- {employee,lead,admin,host,lok,guest}
  doc_paths       TEXT[] NOT NULL,               -- danh sách doc nguồn
  questions       JSONB NOT NULL,                -- [{id,prompt,choices[],answer_idx,explanation}]
  pass_threshold  INT NOT NULL DEFAULT 70
                  CHECK (pass_threshold BETWEEN 0 AND 100),
  format          TEXT NOT NULL DEFAULT 'quiz'
                  CHECK (format IN ('quiz','reading','flashcard')),
  created_by      TEXT NOT NULL REFERENCES roles(email) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_quiz_status_idx
  ON training_quiz (status, created_at DESC);

CREATE TABLE IF NOT EXISTS training_quiz_attempt (
  id              BIGSERIAL PRIMARY KEY,
  quiz_id         BIGINT NOT NULL REFERENCES training_quiz(id) ON DELETE CASCADE,
  email           TEXT NOT NULL REFERENCES roles(email) ON DELETE CASCADE,
  answers         JSONB NOT NULL,                -- [{question_id, choice_idx}]
  score_pct       INT NOT NULL CHECK (score_pct BETWEEN 0 AND 100),
  passed          BOOLEAN NOT NULL,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_quiz_attempt_user_idx
  ON training_quiz_attempt (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS training_quiz_attempt_quiz_idx
  ON training_quiz_attempt (quiz_id);

COMMIT;
