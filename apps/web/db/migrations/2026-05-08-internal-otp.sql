-- Migration: TOTP 2FA for internal staff (employee/lead/admin).
--
-- Apply: psql $DATABASE_URL -f apps/web/db/migrations/2026-05-08-internal-otp.sql
--
-- Idempotent. Safe to re-run.
--
-- Adds three columns to `roles`:
--   - otp_secret_encrypted  : AES-256-GCM ciphertext of the TOTP secret,
--                             encrypted via lib/onboarding/crypto.ts
--                             (per-account DEK). NULL = not enrolled.
--   - otp_secret_nonce      : 28-byte iv ‖ tag from GCM. NULL = not enrolled.
--   - otp_set_at            : when the user enrolled. Used for the
--                             30-day rotation window — login layer treats
--                             `otp_set_at < now() - 30 days` as expired.
--
-- External roles (host/lok/guest) skip OTP entirely; they don't have an
-- enrolled secret and the auth layer doesn't ask for a code from them.

BEGIN;

ALTER TABLE roles ADD COLUMN IF NOT EXISTS otp_secret_encrypted BYTEA;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS otp_secret_nonce     BYTEA;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS otp_set_at           TIMESTAMPTZ;

COMMENT ON COLUMN roles.otp_secret_encrypted IS
  'AES-256-GCM ciphertext of TOTP secret (per-account DEK). NULL = not enrolled.';
COMMENT ON COLUMN roles.otp_secret_nonce     IS
  '28 bytes (iv 12 + GCM tag 16). NULL = not enrolled.';
COMMENT ON COLUMN roles.otp_set_at           IS
  'When user enrolled. NULL or older than 30 days = re-enroll required at login.';

COMMIT;
