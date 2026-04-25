/**
 * Widget HMAC token — issued by back-office, verified here.
 *
 * Format (compact, URL-safe):
 *   {payload-base64url}.{sig-base64url}
 *
 * Payload JSON: { mode: "host"|"lok", tenantId: string, exp: <unix-seconds> }
 *
 * The back-office mints a fresh token per dashboard session by calling
 * POST /api/widget/token with a shared secret. The widget JS embeds it
 * in `data-token` and sends it as Authorization: Bearer <token> on every
 * widget chat request.
 *
 * Why HMAC over JWT: 1 dependency (built-in `crypto`), no library ambiguity,
 * payload visibly opaque to the dashboard user. We don't need rich claims.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type WidgetMode = "host" | "lok";

export interface WidgetClaims {
  mode: WidgetMode;
  tenantId: string;
  exp: number; // unix seconds
}

const ENC = "base64url" as const;

function b64uEncode(s: Buffer | string): string {
  return Buffer.from(s).toString(ENC);
}

function b64uDecode(s: string): Buffer {
  return Buffer.from(s, ENC);
}

function getSecret(): Buffer {
  const s = process.env.WIDGET_HMAC_SECRET;
  if (!s || s.length < 32) {
    throw new Error("WIDGET_HMAC_SECRET not set or too short (min 32 chars)");
  }
  return Buffer.from(s, "utf8");
}

export function signWidgetToken(claims: Omit<WidgetClaims, "exp"> & { ttlSeconds?: number }): string {
  const ttl = claims.ttlSeconds ?? 3600;
  const payload: WidgetClaims = {
    mode: claims.mode,
    tenantId: claims.tenantId,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const body = b64uEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest(ENC);
  return `${body}.${sig}`;
}

export function verifyWidgetToken(token: string): WidgetClaims {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Token format invalid");
  const [body, sig] = parts;
  const expected = createHmac("sha256", getSecret()).update(body).digest();
  const got = b64uDecode(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    throw new Error("Token signature mismatch");
  }
  const payload = JSON.parse(b64uDecode(body).toString("utf8")) as WidgetClaims;
  if (!payload.mode || !payload.tenantId || !payload.exp) {
    throw new Error("Token claims malformed");
  }
  if (payload.mode !== "host" && payload.mode !== "lok") {
    throw new Error("Token mode invalid");
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }
  return payload;
}

/** Origin allowlist check. Returns the matched origin, or null. */
export function checkAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const list = (process.env.WIDGET_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes("*")) return origin;
  return list.includes(origin) ? origin : null;
}

/** Verify back-office shared secret on token-mint endpoint. */
export function checkBackofficeSecret(header: string | null): boolean {
  const expected = process.env.BACKOFFICE_SHARED_SECRET ?? "";
  if (!expected || expected.length < 32) return false;
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/.exec(header);
  if (!m) return false;
  const got = Buffer.from(m[1], "utf8");
  const want = Buffer.from(expected, "utf8");
  return got.length === want.length && timingSafeEqual(got, want);
}
