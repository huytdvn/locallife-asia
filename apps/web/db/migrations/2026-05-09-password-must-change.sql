-- Migration: thêm flag bắt user đổi password lần đầu / sau khi admin reset.
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-09-password-must-change.sql
-- Idempotent.
--
-- Logic:
--   1. Admin set password mới qua /admin/users → trigger set must_change=true
--      (báo user password tạm thời, đổi ngay sau khi login).
--   2. User login lần đầu → middleware redirect /profile/change-password.
--   3. User submit password mới → clear flag.
--   4. Khi user tự đổi password (qua /profile/change-password) → flag = false.

BEGIN;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN roles.password_must_change IS
  'true = user phải đổi password ở lần login tới (admin vừa set tạm). Tự clear sau khi user đổi.';

-- Backfill: user nào hiện có password_hash + password_set_by != email → admin đã set,
-- bật must_change. User tự set sẽ không bị bật.
UPDATE roles
SET password_must_change = true
WHERE password_hash IS NOT NULL
  AND password_set_by IS NOT NULL
  AND password_set_by <> email
  AND password_must_change = false;

COMMIT;
