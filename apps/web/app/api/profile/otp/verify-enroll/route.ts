import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  otpRequiredForRole,
  saveOtpSecret,
  verifyOtpCode,
} from "@/lib/otp";

export const runtime = "nodejs";

const bodySchema = z.object({
  secret: z.string().min(16).max(64),
  code: z.string().regex(/^\d{6}$/),
});

/**
 * POST /api/profile/otp/verify-enroll
 *
 * Body: { secret, code }
 *
 * Re-verifies the candidate code against the freshly-generated secret
 * (proving the user's authenticator is in sync) before encrypting the
 * secret + persisting via lib/otp.ts:saveOtpSecret. After this lands,
 * the JWT's needsOtpSetup flag clears on next refresh and the user can
 * navigate the app normally.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (!otpRequiredForRole(session.role)) {
    return NextResponse.json(
      { error: "OTP_NOT_APPLICABLE_FOR_ROLE" },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body cần { secret, code (6 số) }" },
      { status: 400 }
    );
  }

  const { secret, code } = parsed.data;
  if (!verifyOtpCode(secret, code)) {
    return NextResponse.json(
      { error: "OTP_INVALID", detail: "Mã không khớp — đồng hồ máy lệch?" },
      { status: 400 }
    );
  }

  const ok = await saveOtpSecret(session.email, secret);
  if (!ok) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", detail: "Email không có trong roles" },
      { status: 404 }
    );
  }

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { otp_enrolled: true },
  });

  return NextResponse.json({ ok: true });
}
