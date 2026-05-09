import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  buildOtpAuthUri,
  generateSecret,
  otpRequiredForRole,
} from "@/lib/otp";
import qrcode from "qrcode";

export const runtime = "nodejs";

/**
 * POST /api/profile/otp/generate
 *
 * Mints a fresh TOTP secret for the current user and returns the
 * otpauth URI + QR data URL. The secret is NOT yet persisted — only
 * after the client posts back a verified 6-digit code via
 * /api/profile/otp/verify-enroll do we encrypt + save it. This keeps
 * a never-confirmed secret out of the database.
 *
 * Internal-only: external roles (host/lok/guest) get 403.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (!otpRequiredForRole(session.role)) {
    return NextResponse.json(
      { error: "OTP_NOT_APPLICABLE_FOR_ROLE" },
      { status: 403 }
    );
  }

  const secret = generateSecret();
  const uri = buildOtpAuthUri(session.email, secret);
  const qrDataUrl = await qrcode.toDataURL(uri, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  return NextResponse.json({
    secret, // base32 — user can also paste manually if QR scan fails
    uri,
    qrDataUrl,
  });
}
