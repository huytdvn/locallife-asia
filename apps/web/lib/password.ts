import bcrypt from "bcryptjs";
import { query, isEnabled } from "@/lib/db";

/**
 * Password auth helpers — bcrypt hash + verify + DB IO.
 *
 * Passwords lưu cùng bảng `roles` (cột `password_hash` nullable). NULL =
 * SSO only. Khi admin set password, user có thể đăng nhập qua Credentials
 * provider thay vì Google SSO — phù hợp internal user không có
 * @locallife.asia Workspace account.
 */

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LEN = 10;

export interface PasswordPolicy {
  ok: boolean;
  errors: string[];
}

export function validatePassword(pw: string): PasswordPolicy {
  const errors: string[] = [];
  if (pw.length < MIN_PASSWORD_LEN) {
    errors.push(`Password phải ≥ ${MIN_PASSWORD_LEN} ký tự (nhận ${pw.length})`);
  }
  if (!/[a-z]/.test(pw)) errors.push("Phải có ít nhất 1 chữ thường");
  if (!/[A-Z]/.test(pw)) errors.push("Phải có ít nhất 1 chữ hoa");
  if (!/[0-9]/.test(pw)) errors.push("Phải có ít nhất 1 chữ số");
  // No special-char requirement — friction without significant security gain
  // for internal-only login. Length + class diversity is enough.
  return { ok: errors.length === 0, errors };
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

/**
 * Set password for an email. ON CONFLICT updates hash + audit fields.
 * Returns true if updated, false if email không tồn tại trong `roles`.
 */
export async function setPasswordForEmail(input: {
  email: string;
  newPassword: string;
  setByEmail: string;
}): Promise<boolean> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const policy = validatePassword(input.newPassword);
  if (!policy.ok) {
    throw new Error("Password không đạt yêu cầu: " + policy.errors.join("; "));
  }
  const hash = await hashPassword(input.newPassword);
  const rows = await query<{ email: string }>(
    `UPDATE roles
       SET password_hash = $2,
           password_set_at = now(),
           password_set_by = $3
     WHERE email = $1
     RETURNING email`,
    [input.email, hash, input.setByEmail]
  );
  return rows.length > 0;
}

/**
 * Verify email + password. Returns email if matches AND user not disabled.
 * Constant-time-ish (bcrypt compare); no timing leak between "no email"
 * vs "wrong password" because we always hash a fixed string when no row.
 */
export async function verifyPassword(
  email: string,
  password: string
): Promise<{ email: string } | null> {
  if (!isEnabled()) return null;
  const rows = await query<{
    email: string;
    password_hash: string | null;
    disabled: boolean;
  }>(
    `SELECT email, password_hash, disabled FROM roles WHERE email = $1`,
    [email]
  );
  // Always do a hash compare to avoid timing leak — even when row missing
  // or password not set, run bcrypt on a dummy hash with same cost.
  const dummyHash =
    "$2b$12$ABCDEFGHIJKLMNOPQRSTUu/aIvSzbFLcN/7N/aBaDC8XhV.skfYZK";
  const target = rows[0]?.password_hash ?? dummyHash;
  const match = await bcrypt.compare(password, target);

  if (!match) return null;
  if (rows.length === 0 || !rows[0].password_hash) return null;
  if (rows[0].disabled) return null;
  return { email: rows[0].email };
}

/**
 * Clear password (force user back to SSO-only). Admin-callable.
 */
export async function clearPasswordForEmail(input: {
  email: string;
  clearedByEmail: string;
}): Promise<boolean> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ email: string }>(
    `UPDATE roles
       SET password_hash = NULL,
           password_set_at = now(),
           password_set_by = $2
     WHERE email = $1 AND password_hash IS NOT NULL
     RETURNING email`,
    [input.email, input.clearedByEmail]
  );
  return rows.length > 0;
}

export async function hasPassword(email: string): Promise<boolean> {
  if (!isEnabled()) return false;
  const rows = await query<{ has: boolean }>(
    `SELECT password_hash IS NOT NULL AS has FROM roles WHERE email = $1`,
    [email]
  );
  return rows[0]?.has === true;
}
