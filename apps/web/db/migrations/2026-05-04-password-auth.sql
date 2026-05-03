-- Migration: extend `roles` with optional password auth.
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-04-password-auth.sql
--
-- Idempotent. Safe to re-run. Backward-compat: existing Google SSO users
-- have password_hash NULL and continue working unchanged. Admin sets
-- password via /api/admin/users/set-password for users without Google
-- Workspace accounts (vd: server-on-prem internal users).

BEGIN;

ALTER TABLE roles ADD COLUMN IF NOT EXISTS password_hash    TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS password_set_at  TIMESTAMPTZ;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS password_set_by  TEXT;

COMMENT ON COLUMN roles.password_hash    IS 'bcrypt hash; NULL = SSO only';
COMMENT ON COLUMN roles.password_set_at  IS 'Last password change timestamp';
COMMENT ON COLUMN roles.password_set_by  IS 'Admin email who set/reset password';

COMMIT;
