import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getQuizForUser } from "@/lib/admin-builders/persistence";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;
  const quizId = Number(id);
  if (!Number.isFinite(quizId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const quiz = await getQuizForUser(quizId, session.role);
  if (!quiz) {
    return NextResponse.json({ error: "not_found_or_no_audience" }, { status: 404 });
  }
  return NextResponse.json({ quiz });
}
