-- Migration: chuyển onboarding_step_question sang MC + link review_quiz.
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-09-mc-questions-review-quiz.sql
-- Idempotent.
--
-- 2 thay đổi:
--   1. step_question giờ hỗ trợ trắc nghiệm: choices[] + answer_idx + explanation.
--      Cột cũ expected_keywords/min_keywords giữ lại làm fallback (vài flow cũ
--      chưa migrate). Grader sẽ ưu tiên MC nếu choices có data.
--   2. onboarding_flow.review_quiz_id link tới training_quiz "ôn lại" — sau
--      khi user pass flow, kết quả page sẽ gợi ý làm quiz này trong tuần.

BEGIN;

ALTER TABLE onboarding_step_question
  ADD COLUMN IF NOT EXISTS choices       TEXT[],
  ADD COLUMN IF NOT EXISTS answer_idx    INT,
  ADD COLUMN IF NOT EXISTS explanation   TEXT;

COMMENT ON COLUMN onboarding_step_question.choices IS
  'MC choices array; NULL = câu tự luận chấm keyword (legacy).';
COMMENT ON COLUMN onboarding_step_question.answer_idx IS
  'Index 0-based vào choices[] cho đáp án đúng.';
COMMENT ON COLUMN onboarding_step_question.explanation IS
  'Giải thích hiển thị sau khi user chấm — dạy nhanh khi sai.';

ALTER TABLE onboarding_flow
  ADD COLUMN IF NOT EXISTS review_quiz_id BIGINT
    REFERENCES training_quiz(id) ON DELETE SET NULL;

COMMENT ON COLUMN onboarding_flow.review_quiz_id IS
  'Quiz ôn lại tự gen cùng lúc với flow. NULL = chưa có (flow cũ).';

CREATE INDEX IF NOT EXISTS onboarding_flow_review_quiz_idx
  ON onboarding_flow (review_quiz_id) WHERE review_quiz_id IS NOT NULL;

COMMIT;
