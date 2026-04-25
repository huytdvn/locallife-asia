import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getAllProgress } from "@/lib/training-progress";

export const runtime = "nodejs";

/**
 * Admin / lead xem toàn bộ progress training.
 */
export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const all = getAllProgress();
  // Flatten thành list rows dễ render
  const rows: Array<{
    email: string;
    slug: string;
    started_at: string;
    updated_at: string;
    completed_count: number;
    quiz_best: number | null;
    quiz_passed: boolean;
    quiz_attempts: number;
    quiz_passed_at: string | null;
  }> = [];
  for (const [email, user] of Object.entries(all)) {
    for (const [slug, p] of Object.entries(user)) {
      rows.push({
        email,
        slug,
        started_at: p.started_at,
        updated_at: p.updated_at,
        completed_count: p.completed_steps.length,
        quiz_best: p.quiz?.best_score ?? null,
        quiz_passed: !!p.quiz?.passed_at,
        quiz_attempts: p.quiz?.attempts.length ?? 0,
        quiz_passed_at: p.quiz?.passed_at ?? null,
      });
    }
  }
  rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return NextResponse.json({ rows });
}
