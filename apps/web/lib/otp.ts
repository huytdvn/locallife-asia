/**
 * TOTP (RFC 6238) helpers for internal-staff 2FA.
 *
 * - `otplib` for the actual algorithm (audited, drift-tolerant).
 * - Per-account secret encrypted at rest via `lib/onboarding/crypto.ts`
 *   (AES-256-GCM with master-wrapped DEK).
 * - 30-day rotation: `isOtpExpired(setAt)` exposes the policy check used
 *   by the login layer + middleware.
 *
 * External roles (host/lok/guest) do NOT enroll — only employee/lead/admin.
 */

import { generateSecret as otpGenerateSecret, generateURI, verifySync } from "otplib";
import {
  encryptForAccount,
  decryptForAccount,
} from "@/lib/onboarding/crypto";
import { isEnabled, query } from "@/lib/db";
import { isInternal, type Role } from "@/lib/rbac";

const ISSUER = "Bé Tre · Local Life";

// 30-day rotation window. Tweak via env if regulators ever require shorter.
const ROTATION_DAYS = Number(process.env.OTP_ROTATION_DAYS ?? "30");

// Accept ±30s drift (previous + current + next 30-second slot). Covers small
// clock drift on the user's phone without weakening security meaningfully.
const EPOCH_TOLERANCE_SEC = 30;

export function generateSecret(): string {
  return otpGenerateSecret(); // base32, 20 bytes default
}

export function buildOtpAuthUri(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export function verifyOtpCode(secret: string, code: string): boolean {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  try {
    const result = verifySync({
      secret,
      token: trimmed,
      epochTolerance: EPOCH_TOLERANCE_SEC,
    });
    return result.valid;
  } catch {
    return false;
  }
}

export interface OtpStatus {
  enrolled: boolean;
  setAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export function isOtpExpired(setAt: Date | null): boolean {
  if (!setAt) return true;
  const ms = Date.now() - setAt.getTime();
  return ms > ROTATION_DAYS * 86_400_000;
}

export function expiryFor(setAt: Date | null): Date | null {
  if (!setAt) return null;
  return new Date(setAt.getTime() + ROTATION_DAYS * 86_400_000);
}

/** Whether this role is forced to use OTP. External roles skip. */
export function otpRequiredForRole(role: Role): boolean {
  return isInternal(role);
}

/** Read OTP status for an email (no decrypt — just whether enrolled + dates). */
export async function getOtpStatus(email: string): Promise<OtpStatus> {
  if (!isEnabled()) {
    return { enrolled: false, setAt: null, expiresAt: null, isExpired: true };
  }
  const rows = await query<{
    otp_secret_encrypted: Buffer | null;
    otp_set_at: string | null;
  }>(
    `SELECT otp_secret_encrypted, otp_set_at::text AS otp_set_at
       FROM roles WHERE email = $1`,
    [email.toLowerCase()]
  );
  const row = rows[0];
  if (!row || !row.otp_secret_encrypted || !row.otp_set_at) {
    return { enrolled: false, setAt: null, expiresAt: null, isExpired: true };
  }
  const setAt = new Date(row.otp_set_at);
  return {
    enrolled: true,
    setAt,
    expiresAt: expiryFor(setAt),
    isExpired: isOtpExpired(setAt),
  };
}

/**
 * Verify a candidate OTP code against the stored secret for `email`.
 * Returns true only if the code is valid AND the enrollment hasn't
 * expired. Used by login.
 */
export async function verifyEnrolledOtp(
  email: string,
  code: string
): Promise<boolean> {
  if (!isEnabled()) return false;
  const lower = email.toLowerCase();
  const rows = await query<{
    otp_secret_encrypted: Buffer | null;
    otp_secret_nonce: Buffer | null;
    otp_set_at: string | null;
  }>(
    `SELECT otp_secret_encrypted, otp_secret_nonce, otp_set_at::text AS otp_set_at
       FROM roles WHERE email = $1`,
    [lower]
  );
  const row = rows[0];
  if (
    !row ||
    !row.otp_secret_encrypted ||
    !row.otp_secret_nonce ||
    !row.otp_set_at
  ) {
    return false;
  }
  if (isOtpExpired(new Date(row.otp_set_at))) return false;
  let secret: string;
  try {
    secret = await decryptForAccount(
      lower,
      row.otp_secret_encrypted,
      row.otp_secret_nonce
    );
  } catch {
    return false;
  }
  return verifyOtpCode(secret, code);
}

/**
 * Enroll: encrypt the secret + persist with current timestamp. Returns
 * true if a row was updated. Caller should have already called
 * verifyOtpCode against the candidate secret to confirm the user's
 * authenticator is in sync.
 */
export async function saveOtpSecret(
  email: string,
  secret: string
): Promise<boolean> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const lower = email.toLowerCase();
  const enc = await encryptForAccount(lower, secret);
  const rows = await query<{ email: string }>(
    `UPDATE roles
        SET otp_secret_encrypted = $2,
            otp_secret_nonce     = $3,
            otp_set_at           = now(),
            updated_at           = now()
      WHERE email = $1
      RETURNING email`,
    [lower, enc.ciphertext, enc.nonce]
  );
  return rows.length > 0;
}

/** Admin reset: clear the secret so user must re-enroll on next login. */
export async function resetOtpForEmail(email: string): Promise<boolean> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ email: string }>(
    `UPDATE roles
        SET otp_secret_encrypted = NULL,
            otp_secret_nonce     = NULL,
            otp_set_at           = NULL,
            updated_at           = now()
      WHERE email = $1
      RETURNING email`,
    [email.toLowerCase()]
  );
  return rows.length > 0;
}
