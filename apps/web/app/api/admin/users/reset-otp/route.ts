import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { resetOtpForEmail } from "@/lib/otp";

export const runtime = "nodejs";

const bodySchema = z.object({
  email: z.string().email().toLowerCase(),
});

/**
 * POST /api/admin/users/reset-otp { email }
 *
 * Admin-only. Wipes the target user's encrypted OTP secret + setAt so on
 * their next login the JWT flags `needsOtpSetup` and middleware bounces
 * them through /profile/otp-setup to register a fresh authenticator.
 *
 * Use when a user loses their phone, switches Authenticator app, or you
 * suspect compromise. Each call writes an audit_log row with target +
 * actor for forensics.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const { email } = parsed.data;
  const ok = await resetOtpForEmail(email);
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { target: email, otp_reset: true, found: ok },
  });
  return NextResponse.json({ ok });
}
