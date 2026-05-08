import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { publishOnboardingFlow } from "@/lib/admin-builders/persistence";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

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
  const ok = await publishOnboardingFlow(flowId);
  if (!ok) {
    return NextResponse.json(
      { error: "not_draft_or_not_found" },
      { status: 404 }
    );
  }
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { kind: "onboarding_flow_publish", flow_id: flowId },
  });
  return NextResponse.json({ ok: true });
}
