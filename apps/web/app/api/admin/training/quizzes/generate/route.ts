import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { generateTrainingQuiz } from "@/lib/admin-builders/ai";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const bodySchema = z.object({
  docPaths: z.array(z.string().min(1)).min(1).max(10),
  audience: z.array(
    z.enum(["employee", "lead", "admin", "host", "lok", "guest"])
  ).min(1),
  format: z.enum(["quiz", "reading", "flashcard"]).default("quiz"),
  customInstruction: z.string().max(500).optional(),
});

/**
 * POST /api/admin/training/quizzes/generate
 * { docPaths[], audience[], format?, customInstruction? } → TrainingQuizDraft
 *
 * Không lưu DB — admin review/edit ở UI rồi POST /quizzes để save.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body cần { docPaths[], audience[], format? }" },
      { status: 400 }
    );
  }
  try {
    const draft = await generateTrainingQuiz({
      docPaths: parsed.data.docPaths,
      format: parsed.data.format,
      audience: parsed.data.audience as Role[],
      customInstruction: parsed.data.customInstruction,
    });
    if (draft.questions.length === 0) {
      return NextResponse.json(
        { error: "AI không sinh được câu hỏi — thử thêm tài liệu khác?" },
        { status: 422 }
      );
    }
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ai_failed" },
      { status: 500 }
    );
  }
}
