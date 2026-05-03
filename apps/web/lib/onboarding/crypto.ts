import sodium from "libsodium-wrappers";
import { query, isEnabled } from "@/lib/db";

/**
 * Envelope encryption cho response text của daily_popup (FR-010, R2).
 *
 * Master key (`ONBOARDING_DEK_MASTER`, 64 hex = 32 bytes) wrap mỗi DEK
 * 32 bytes per-account. DEK lưu encrypted ở `account_crypto_key`. Plaintext
 * dùng `secretbox(text, dek, random_nonce)`; nonce lưu cùng ciphertext.
 *
 * Decrypt: nonce + dek_encrypted → unwrap với master → decrypt response.
 * In-process cache DEK 60s để tránh round-trip DB cho aggregate decrypt.
 */

const MASTER_HEX = process.env.ONBOARDING_DEK_MASTER ?? "";

let _ready = false;
async function ensureReady(): Promise<void> {
  if (_ready) return;
  await sodium.ready;
  if (!MASTER_HEX || MASTER_HEX.length !== 64) {
    throw new Error(
      "ONBOARDING_DEK_MASTER chưa set hoặc không phải 64 hex chars (32 bytes)"
    );
  }
  _ready = true;
}

function masterKey(): Uint8Array {
  return sodium.from_hex(MASTER_HEX);
}

const dekCache = new Map<string, { dek: Uint8Array; expiresAt: number }>();
const DEK_TTL_MS = 60_000;

async function getOrCreateDek(email: string): Promise<Uint8Array> {
  await ensureReady();
  const cached = dekCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.dek;

  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");

  const rows = await query<{ dek_encrypted: Buffer; dek_nonce: Buffer }>(
    "SELECT dek_encrypted, dek_nonce FROM account_crypto_key WHERE email = $1",
    [email]
  );
  if (rows.length > 0) {
    const dek = sodium.crypto_secretbox_open_easy(
      new Uint8Array(rows[0].dek_encrypted),
      new Uint8Array(rows[0].dek_nonce),
      masterKey()
    );
    if (!dek) throw new Error(`DEK decrypt fail cho ${email}`);
    dekCache.set(email, { dek, expiresAt: Date.now() + DEK_TTL_MS });
    return dek;
  }

  // Tạo DEK mới (ensure-on-first-use)
  const dek = sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const dekEncrypted = sodium.crypto_secretbox_easy(dek, nonce, masterKey());
  await query(
    `INSERT INTO account_crypto_key (email, dek_encrypted, dek_nonce)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [email, Buffer.from(dekEncrypted), Buffer.from(nonce)]
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
  await ensureReady();
  const dek = await getOrCreateDek(email);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    dek
  );
  return { ciphertext: Buffer.from(cipher), nonce: Buffer.from(nonce) };
}

export async function decryptForAccount(
  email: string,
  ciphertext: Buffer,
  nonce: Buffer
): Promise<string> {
  await ensureReady();
  const dek = await getOrCreateDek(email);
  const plain = sodium.crypto_secretbox_open_easy(
    new Uint8Array(ciphertext),
    new Uint8Array(nonce),
    dek
  );
  if (!plain) throw new Error("Decrypt fail (wrong key hoặc payload corrupt)");
  return sodium.to_string(plain);
}

/** Reset cache — chủ yếu cho test. */
export function _clearDekCache(): void {
  dekCache.clear();
}
