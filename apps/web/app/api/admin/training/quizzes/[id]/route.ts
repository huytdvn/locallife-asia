import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { deleteTrainingQuiz } from "@/lib/admin-builders/persistence";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const quizId = Number(id);
  if (!Number.isFinite(quizId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const ok = await deleteTrainingQuiz(quizId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { kind: "training_quiz_delete", quiz_id: quizId },
  });
  return NextResponse.json({ ok: true });
}
