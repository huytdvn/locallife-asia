import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPathsForRole } from "@/lib/training";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  const paths = getPathsForRole(session.role);
  return NextResponse.json({ paths, role: session.role });
}
