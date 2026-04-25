-- Migration: extend `roles` table to support all 6 roles + admin-managed lifecycle.
--
-- Apply on existing deployments:
--   psql $DATABASE_URL -f apps/web/db/migrations/2026-04-25-extend-roles.sql
--
-- Idempotent. Safe to re-run.

BEGIN;

-- 1. Drop old CHECK constraint (name varies by Postgres version — try the
--    common auto-generated names; fall through if already dropped).
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'roles'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%IN%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- 2. Re-add the constraint with all 6 roles.
ALTER TABLE roles
  ADD CONSTRAINT roles_role_check
  CHECK (role IN ('employee', 'lead', 'admin', 'host', 'lok', 'guest'));

-- 3. Add lifecycle columns if missing.
ALTER TABLE roles ADD COLUMN IF NOT EXISTS disabled   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 4. Active-role index for fast lookups in admin UI.
CREATE INDEX IF NOT EXISTS roles_role_idx ON roles (role) WHERE NOT disabled;

COMMIT;
