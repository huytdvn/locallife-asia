import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { assignOnboardingFlow } from "@/lib/admin-builders/persistence";
import { writeAudit } from "@/lib/audit";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const bodySchema = z.object({
  emails: z.array(z.string().email()).max(200).default([]),
  roles: z.array(
    z.enum(["employee", "lead", "admin", "host", "lok", "guest"])
  ).default([]),
});

/**
 * POST /api/admin/onboarding/flows/[id]/assign
 * { emails[], roles[] } → tạo onboarding_assignment row cho từng target.
 *
 * XOR enforced bởi DB constraint: 1 row chỉ có target_email HOẶC
 * target_role. Bulk thì tách thành nhiều INSERT.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (parsed.data.emails.length === 0 && parsed.data.roles.length === 0) {
    return NextResponse.json(
      { error: "Cần ít nhất 1 email hoặc 1 role" },
      { status: 400 }
    );
  }
  try {
    const { created } = await assignOnboardingFlow({
      flowId,
      targetEmails: parsed.data.emails,
      targetRoles: parsed.data.roles as Role[],
      assignedBy: session.email,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        kind: "onboarding_assign",
        flow_id: flowId,
        emails: parsed.data.emails.length,
        roles: parsed.data.roles,
        created,
      },
    });
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "assign_failed" },
      { status: 500 }
    );
  }
}
