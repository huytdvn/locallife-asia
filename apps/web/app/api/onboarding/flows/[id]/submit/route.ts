import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  getOnboardingFlow,
  recordFlowAttempt,
  userIsAssignedToFlow,
} from "@/lib/admin-builders/persistence";
import { gradeFlow } from "@/lib/admin-builders/grading";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  answers: z.array(
    z.object({
      step_id: z.number().int(),
      question_id: z.number().int(),
      // MC: number (index choice). Keyword: string (free text). null = bỏ trắng.
      answer: z.union([z.string().max(2000), z.number().int(), z.null()]),
    })
  ),
});

/**
 * POST /api/onboarding/flows/[id]/submit
 * { answers[] } → chấm keyword + lưu attempt + trả grade.
 *
 * Server tự load expected_keywords từ DB (không nhận từ client) → user
 * không thể tweak chấm.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (session.role !== "admin" && session.role !== "lead") {
    const ok = await userIsAssignedToFlow(session.email, session.role, flowId);
    if (!ok) {
      return NextResponse.json({ error: "not_assigned" }, { status: 403 });
    }
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const flow = await getOnboardingFlow(flowId);
  if (!flow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Build steps payload cho grader: pair từng question với answer
  const answerByQ = new Map<number, string | number | null>();
  for (const a of parsed.data.answers) {
    answerByQ.set(a.question_id, a.answer);
  }

  const grade = gradeFlow({
    passThreshold: flow.pass_threshold,
    steps: flow.steps.map((s) => ({
      step_id: s.id,
      questions: s.questions.map((q) => ({
        question_id: q.id,
        choices: q.choices,
        answer_idx: q.answer_idx,
        explanation: q.explanation,
        expected_keywords: q.expected_keywords,
        min_keywords: q.min_keywords,
        answer: answerByQ.get(q.id) ?? null,
      })),
    })),
  });

  const { id: attemptId } = await recordFlowAttempt({
    flowId,
    email: session.email,
    passed: grade.passed,
    scorePct: grade.score_pct,
    stepResults: grade.step_results.map((s) => ({
      step_id: s.step_id,
      score_pct: s.score_pct,
      passed: s.passed,
    })),
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: {
      kind: "onboarding_flow_attempt",
      flow_id: flowId,
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
    step_results: grade.step_results,
    review_quiz_id: flow.review_quiz_id,
  });
}
