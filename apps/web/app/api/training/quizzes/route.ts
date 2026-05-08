import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { listQuizzesForRole } from "@/lib/admin-builders/persistence";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  const quizzes = await listQuizzesForRole(session.role);
  return NextResponse.json({ quizzes });
}
