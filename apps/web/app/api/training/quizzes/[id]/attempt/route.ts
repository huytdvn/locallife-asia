import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  getQuizForUser,
  getQuizFull,
  recordQuizAttempt,
} from "@/lib/admin-builders/persistence";
import { gradeQuiz } from "@/lib/admin-builders/grading";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string().min(1).max(20),
      choice_idx: z.number().int().min(0).max(10),
    })
  ),
});

/**
 * POST /api/training/quizzes/[id]/attempt
 *
 * Server load full questions (kèm answer_idx + explanation) → chấm. Trả
 * về score + per-question breakdown (đáp án đúng + giải thích) để client
 * render kết quả.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;
  const quizId = Number(id);
  if (!Number.isFinite(quizId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  // Verify user có quyền (audience match) trước khi chấm
  const quiz = await getQuizForUser(quizId, session.role);
  if (!quiz) {
    return NextResponse.json({ error: "not_found_or_no_audience" }, { status: 404 });
  }
  const full = await getQuizFull(quizId);
  if (!full) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const grade = gradeQuiz({
    passThreshold: quiz.pass_threshold,
    questions: full,
    answers: parsed.data.answers,
  });

  const { id: attemptId } = await recordQuizAttempt({
    quizId,
    email: session.email,
    answers: parsed.data.answers,
    scorePct: grade.score_pct,
    passed: grade.passed,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: {
      kind: "training_quiz_attempt",
      quiz_id: quizId,
      attempt_id: attemptId,
      passed: grade.passed,
      score_pct: grade.score_pct,
    },
  });

  return NextResponse.json({
    ok: true,
    attempt_id: attemptId,
    passed: grade.passed,
    score_pct: grade.score_pct,
    details: grade.details,
  });
}
