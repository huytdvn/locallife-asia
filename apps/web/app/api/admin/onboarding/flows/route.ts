import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  listOnboardingFlows,
  saveOnboardingFlow,
  saveTrainingQuiz,
  setFlowReviewQuiz,
} from "@/lib/admin-builders/persistence";
import { generateReviewQuizForFlow } from "@/lib/admin-builders/ai";
import { writeAudit } from "@/lib/audit";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const docSchema = z.object({
  doc_path: z.string().min(1),
  heading_anchor: z.string().nullable(),
  highlight: z.string().max(500),
  reason: z.string().max(300),
});

const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  // MC fields (mới — preferred)
  choices: z.array(z.string().min(1)).min(2).max(6).default([]),
  answer_idx: z.number().int().min(0).max(5).default(0),
  explanation: z.string().max(500).default(""),
  // Legacy keyword (giữ tương thích)
  expected_keywords: z.array(z.string()).max(10).default([]),
  min_keywords: z.number().int().min(1).max(10).default(1),
});

const stepSchema = z.object({
  goal: z.string().min(1).max(300),
  intro: z.string().max(1000),
  pass_criteria: z.string().max(300),
  docs: z.array(docSchema).max(6),
  questions: z.array(questionSchema).max(8),
});

const bodySchema = z.object({
  draft: z.object({
    title: z.string().min(1).max(120),
    motto: z.string().max(200),
    pass_threshold: z.number().int().min(40).max(95),
    steps: z.array(stepSchema).min(1).max(10),
  }),
  brief: z.string().max(2000).optional(),
  /** Audience role để gen review quiz đi kèm. Optional → nếu missing skip gen. */
  audienceRole: z.enum(["employee", "lead", "admin", "host", "lok", "guest"]).optional(),
});

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const flows = await listOnboardingFlows();
  return NextResponse.json({ flows });
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ admin được tạo flow onboarding" },
      { status: 403 }
    );
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Draft không hợp lệ", detail: parsed.error.format() },
      { status: 400 }
    );
  }

  try {
    const { id } = await saveOnboardingFlow({
      draft: parsed.data.draft,
      brief: parsed.data.brief ?? null,
      createdBy: session.email,
    });

    // Auto-gen review quiz cùng topic — chỉ gen nếu có audienceRole (UI mới
    // luôn pass) + có doc references trong flow. Best-effort: nếu fail thì
    // vẫn return flow id, admin có thể tạo quiz tay sau.
    let reviewQuizId: number | null = null;
    if (parsed.data.audienceRole) {
      try {
        const allDocPaths = Array.from(
          new Set(
            parsed.data.draft.steps.flatMap((s) =>
              s.docs.map((d) => d.doc_path)
            )
          )
        );
        if (allDocPaths.length > 0) {
          const reviewDraft = await generateReviewQuizForFlow({
            flowTitle: parsed.data.draft.title,
            flowMotto: parsed.data.draft.motto,
            audienceRole: parsed.data.audienceRole as Role,
            docPaths: allDocPaths,
          });
          if (reviewDraft.questions.length > 0) {
            const saved = await saveTrainingQuiz({
              draft: reviewDraft,
              audience: [parsed.data.audienceRole as Role],
              docPaths: allDocPaths,
              format: "quiz",
              createdBy: session.email,
            });
            reviewQuizId = saved.id;
            await setFlowReviewQuiz(id, reviewQuizId);
          }
        }
      } catch (e) {
        console.warn("review quiz gen failed", e);
      }
    }

    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        kind: "onboarding_flow_create",
        flow_id: id,
        title: parsed.data.draft.title,
        steps: parsed.data.draft.steps.length,
        review_quiz_id: reviewQuizId,
      },
    });
    return NextResponse.json({ ok: true, id, review_quiz_id: reviewQuizId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "save_failed" },
      { status: 500 }
    );
  }
}
