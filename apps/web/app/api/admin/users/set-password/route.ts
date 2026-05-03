import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { setPasswordForEmail, clearPasswordForEmail, validatePassword } from "@/lib/password";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const setSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(10).max(200),
});

const clearSchema = z.object({
  email: z.string().email(),
  action: z.literal("clear"),
});

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Chỉ admin được set/clear password" } },
      { status: 403 }
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "JSON không hợp lệ" } },
      { status: 400 }
    );
  }

  // Clear path
  const clearParse = clearSchema.safeParse(raw);
  if (clearParse.success) {
    const ok = await clearPasswordForEmail({
      email: clearParse.data.email,
      clearedByEmail: session.email,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        target: clearParse.data.email,
        action: "clear_password",
        applied: ok,
      },
    });
    return NextResponse.json({
      ok,
      data: ok
        ? { email: clearParse.data.email, status: "cleared" }
        : { email: clearParse.data.email, status: "noop" },
    });
  }

  // Set path
  const setParse = setSchema.safeParse(raw);
  if (!setParse.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "validation",
          message: setParse.error.issues.map((i) => i.message).join("; "),
        },
      },
      { status: 400 }
    );
  }

  const policy = validatePassword(setParse.data.newPassword);
  if (!policy.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "weak_password", message: policy.errors.join("; ") },
      },
      { status: 400 }
    );
  }

  try {
    const ok = await setPasswordForEmail({
      email: setParse.data.email,
      newPassword: setParse.data.newPassword,
      setByEmail: session.email,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        target: setParse.data.email,
        action: "set_password",
        applied: ok,
      },
    });
    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "not_found", message: "Email không có trong roles table" },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      data: { email: setParse.data.email, status: "set" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "internal", message: e instanceof Error ? e.message : String(e) },
      },
      { status: 500 }
    );
  }
}
