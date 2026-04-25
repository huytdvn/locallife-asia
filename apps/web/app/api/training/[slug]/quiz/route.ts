import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPathBySlug } from "@/lib/training";
import {
  generateQuiz,
  scoreQuiz,
  PASS_THRESHOLD,
} from "@/lib/training-quiz";
import { recordQuizAttempt } from "@/lib/training-progress";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * POST = create new attempt (gen questions).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession(req);
  const { slug } = await params;
  const pathDef = getPathBySlug(slug, session.role);
  if (!pathDef) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const { attemptId, masked } = await generateQuiz(session.email, pathDef);
    return NextResponse.json({
      attempt_id: attemptId,
      questions: masked,
      pass_threshold: PASS_THRESHOLD,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "gen_failed" },
      { status: 500 }
    );
  }
}

/**
 * PUT = submit answers { attempt_id, answers: number[] }.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession(req);
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    attempt_id?: string;
    answers?: number[];
  };
  if (!body.attempt_id || !Array.isArray(body.answers)) {
    return NextResponse.json(
      { error: "missing attempt_id or answers" },
      { status: 400 }
    );
  }
  try {
    const scored = scoreQuiz(body.attempt_id, body.answers);
    recordQuizAttempt(
      session.email,
      slug,
      scored.score,
      scored.passed,
      scored.attempt_id
    );
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "chat",
      query: `quiz_submit:${slug}`,
      metadata: {
        training_quiz: true,
        slug,
        score: scored.score,
        passed: scored.passed,
        attempt_id: scored.attempt_id,
      },
    });
    return NextResponse.json(scored);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "score_failed" },
      { status: 500 }
    );
  }
}
