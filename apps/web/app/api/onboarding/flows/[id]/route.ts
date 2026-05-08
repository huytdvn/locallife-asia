import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getOnboardingFlow,
  userIsAssignedToFlow,
} from "@/lib/admin-builders/persistence";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // Admin/lead xem được mọi flow; user thường chỉ xem flow đã assigned cho mình
  if (session.role !== "admin" && session.role !== "lead") {
    const ok = await userIsAssignedToFlow(session.email, session.role, flowId);
    if (!ok) {
      return NextResponse.json({ error: "not_assigned" }, { status: 403 });
    }
  }

  const flow = await getOnboardingFlow(flowId);
  if (!flow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (flow.status !== "published" && session.role !== "admin") {
    return NextResponse.json({ error: "not_published" }, { status: 403 });
  }
  return NextResponse.json({ flow });
}
