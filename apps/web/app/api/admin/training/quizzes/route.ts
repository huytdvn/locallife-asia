import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  listTrainingQuizzes,
  saveTrainingQuiz,
} from "@/lib/admin-builders/persistence";
import { writeAudit } from "@/lib/audit";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const questionSchema = z.object({
  id: z.string().min(1).max(20),
  prompt: z.string().min(1).max(500),
  choices: z.array(z.string().min(1)).min(2).max(6),
  answer_idx: z.number().int().min(0).max(5),
  explanation: z.string().max(500),
});

const bodySchema = z.object({
  draft: z.object({
    title: z.string().min(1).max(120),
    motto: z.string().max(200),
    intro: z.string().max(800),
    pass_threshold: z.number().int().min(40).max(95),
    questions: z.array(questionSchema).min(1).max(20),
  }),
  audience: z.array(
    z.enum(["employee", "lead", "admin", "host", "lok", "guest"])
  ).min(1),
  docPaths: z.array(z.string().min(1)).min(1).max(10),
  format: z.enum(["quiz", "reading", "flashcard"]),
});

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const quizzes = await listTrainingQuizzes();
  return NextResponse.json({ quizzes });
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Chỉ admin được tạo quiz" },
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
  for (const q of parsed.data.draft.questions) {
    if (q.answer_idx >= q.choices.length) {
      return NextResponse.json(
        { error: `Câu "${q.prompt.slice(0, 30)}..." có answer_idx vượt số choices` },
        { status: 400 }
      );
    }
  }

  try {
    const { id } = await saveTrainingQuiz({
      draft: parsed.data.draft,
      audience: parsed.data.audience as Role[],
      docPaths: parsed.data.docPaths,
      format: parsed.data.format,
      createdBy: session.email,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        kind: "training_quiz_create",
        quiz_id: id,
        title: parsed.data.draft.title,
        questions: parsed.data.draft.questions.length,
        audience: parsed.data.audience,
        format: parsed.data.format,
      },
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "save_failed" },
      { status: 500 }
    );
  }
}
