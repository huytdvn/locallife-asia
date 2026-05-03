import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { query, isEnabled } from "@/lib/db";

/**
 * Envelope encryption cho response text của daily_popup (FR-010, R2).
 *
 * Sử dụng Node built-in `node:crypto` AES-256-GCM (audited, zero new deps).
 * Master key (`ONBOARDING_DEK_MASTER`, 64 hex = 32 bytes) wrap mỗi DEK
 * 32 bytes per-account. DEK lưu encrypted ở `account_crypto_key`. Plaintext
 * dùng AES-256-GCM(text, dek, random_iv); IV (12B) + auth tag (16B) lưu
 * tách trong cột `nonce` (chuẩn: nonce_bytes = iv ‖ tag, total 28B).
 *
 * In-process cache DEK 60s để tránh round-trip DB cho aggregate decrypt.
 */

const MASTER_HEX = process.env.ONBOARDING_DEK_MASTER ?? "";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;     // GCM standard
const TAG_LEN = 16;    // GCM auth tag
const KEY_LEN = 32;    // AES-256

function masterKey(): Buffer {
  if (!MASTER_HEX || MASTER_HEX.length !== 64) {
    throw new Error(
      "ONBOARDING_DEK_MASTER chưa set hoặc không phải 64 hex chars (32 bytes)"
    );
  }
  return Buffer.from(MASTER_HEX, "hex");
}

/** Encrypt với AES-256-GCM. Trả {ciphertext, iv|tag (28B)}. */
function aesGcmEncrypt(key: Buffer, plaintext: Buffer): {
  ciphertext: Buffer;
  nonce: Buffer;
} {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct, nonce: Buffer.concat([iv, tag]) };
}

/** Decrypt — nonce = iv (12B) ‖ tag (16B). Throw nếu fail (auth tag mismatch). */
function aesGcmDecrypt(
  key: Buffer,
  ciphertext: Buffer,
  nonce: Buffer
): Buffer {
  if (nonce.length !== IV_LEN + TAG_LEN) {
    throw new Error(
      `nonce phải ${IV_LEN + TAG_LEN} bytes (iv 12 + tag 16), nhận ${nonce.length}`
    );
  }
  const iv = nonce.subarray(0, IV_LEN);
  const tag = nonce.subarray(IV_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

const dekCache = new Map<string, { dek: Buffer; expiresAt: number }>();
const DEK_TTL_MS = 60_000;

async function getOrCreateDek(email: string): Promise<Buffer> {
  const cached = dekCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.dek;

  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");

  const rows = await query<{ dek_encrypted: Buffer; dek_nonce: Buffer }>(
    "SELECT dek_encrypted, dek_nonce FROM account_crypto_key WHERE email = $1",
    [email]
  );
  if (rows.length > 0) {
    const dek = aesGcmDecrypt(
      masterKey(),
      rows[0].dek_encrypted,
      rows[0].dek_nonce
    );
    dekCache.set(email, { dek, expiresAt: Date.now() + DEK_TTL_MS });
    return dek;
  }

  // Tạo DEK mới (ensure-on-first-use)
  const dek = randomBytes(KEY_LEN);
  const wrapped = aesGcmEncrypt(masterKey(), dek);
  await query(
    `INSERT INTO account_crypto_key (email, dek_encrypted, dek_nonce)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [email, wrapped.ciphertext, wrapped.nonce]
  );
  dekCache.set(email, { dek, expiresAt: Date.now() + DEK_TTL_MS });
  return dek;
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  nonce: Buffer;
}

export async function encryptForAccount(
  email: string,
  plaintext: string
): Promise<EncryptedPayload> {
  const dek = await getOrCreateDek(email);
  return aesGcmEncrypt(dek, Buffer.from(plaintext, "utf8"));
}

export async function decryptForAccount(
  email: string,
  ciphertext: Buffer,
  nonce: Buffer
): Promise<string> {
  const dek = await getOrCreateDek(email);
  const plain = aesGcmDecrypt(dek, ciphertext, nonce);
  return plain.toString("utf8");
}

/** Reset cache — chủ yếu cho test. */
export function _clearDekCache(): void {
  dekCache.clear();
}
