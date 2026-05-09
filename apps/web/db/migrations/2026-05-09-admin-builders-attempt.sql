-- Migration: bổ sung bảng attempt cho onboarding_flow (Đợt 2 cùng ngày).
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-09-admin-builders-attempt.sql
--
-- Idempotent.
--
-- Mục đích: lưu kết quả khi user làm bài 1 onboarding_flow. Không lưu per-question
-- answer vì câu trả lời tự luận có thể dài + nhạy cảm — chỉ lưu pass/fail per step
-- + tổng kết. Nếu cần audit chi tiết → đọc audit_log.

BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_flow_attempt (
  id           BIGSERIAL PRIMARY KEY,
  flow_id      BIGINT NOT NULL REFERENCES onboarding_flow(id) ON DELETE CASCADE,
  email        TEXT NOT NULL REFERENCES roles(email) ON DELETE CASCADE,
  passed       BOOLEAN NOT NULL,
  score_pct    INT NOT NULL CHECK (score_pct BETWEEN 0 AND 100),
  step_results JSONB NOT NULL,                  -- [{step_id, score_pct, passed}]
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS onboarding_flow_attempt_user_idx
  ON onboarding_flow_attempt (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_flow_attempt_flow_idx
  ON onboarding_flow_attempt (flow_id);

COMMIT;
