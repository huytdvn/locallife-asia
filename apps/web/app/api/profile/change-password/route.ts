import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  hasPassword,
  setPasswordForEmail,
  validatePassword,
  verifyPassword,
} from "@/lib/password";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  /** Bắt buộc nếu user đã có password (đổi). Optional nếu chưa (set lần đầu
   *  qua dev/SSO chuyển sang password — không có pw cũ để verify). */
  oldPassword: z.string().min(1).max(200).optional(),
  newPassword: z.string().min(10).max(200),
});

/**
 * POST /api/profile/change-password
 *   { oldPassword?, newPassword } → đổi pw chính user.
 *
 * Flow:
 *   1. Nếu user đã có password trong DB → bắt buộc oldPassword + verify match.
 *   2. Validate newPassword theo policy (≥10 chars, lower+upper+digit).
 *   3. setPasswordForEmail với mustChange=false (clear flag → middleware
 *      không redirect nữa).
 *   4. Audit log.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  const email = session.email;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body cần { oldPassword?, newPassword }" },
      { status: 400 }
    );
  }
  const { oldPassword, newPassword } = parsed.data;

  // Verify policy trước khi đụng DB.
  const policy = validatePassword(newPassword);
  if (!policy.ok) {
    return NextResponse.json(
      { error: "Password không đạt yêu cầu", detail: policy.errors },
      { status: 400 }
    );
  }

  // Verify oldPassword nếu user đã có pw.
  const userHasPw = await hasPassword(email);
  if (userHasPw) {
    if (!oldPassword) {
      return NextResponse.json(
        { error: "Cần cung cấp mật khẩu hiện tại" },
        { status: 400 }
      );
    }
    const ok = await verifyPassword(email, oldPassword);
    if (!ok) {
      return NextResponse.json(
        { error: "Mật khẩu hiện tại không đúng" },
        { status: 400 }
      );
    }
  }

  if (oldPassword === newPassword) {
    return NextResponse.json(
      { error: "Mật khẩu mới phải khác mật khẩu cũ" },
      { status: 400 }
    );
  }

  await setPasswordForEmail({
    email,
    newPassword,
    setByEmail: email,
    mustChange: false,
  });

  await writeAudit({
    actorEmail: email,
    role: session.role,
    action: "role_upsert",
    metadata: { kind: "self_change_password" },
  });

  return NextResponse.json({ ok: true });
}
