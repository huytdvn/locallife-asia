import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPathBySlug } from "@/lib/training";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession(req);
  const { slug } = await params;
  const path = getPathBySlug(slug, session.role);
  if (!path) {
    return NextResponse.json(
      { error: "not_found_or_forbidden" },
      { status: 404 }
    );
  }
  return NextResponse.json({ path });
}
