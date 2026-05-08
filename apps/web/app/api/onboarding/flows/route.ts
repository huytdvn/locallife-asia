import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listAssignedFlowsForUser } from "@/lib/admin-builders/persistence";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  const flows = await listAssignedFlowsForUser(session.email, session.role);
  return NextResponse.json({ flows });
}
