import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { adminDecide, type AdminDecision } from "@/lib/onboarding/weekly-assignment";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  decision: z.enum(["ok", "request_supplement"]),
  knowledgeTask: z
    .object({
      topic: z.string().min(3).max(200),
      audience: z.array(z.enum(["host", "employee", "lead", "admin"])).min(1),
      level: z.enum(["entry", "mid", "senior"]).optional(),
      deadlineDays: z.number().int().min(1).max(30).default(7),
      levelBased: z.boolean().default(false),
    })
    .optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Chỉ admin được verify assignment" } },
      { status: 403 }
    );
  }
  const { id } = await params;
  const assignmentId = Number(id);
  if (!Number.isInteger(assignmentId) || assignmentId <= 0) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "id không hợp lệ" } },
      { status: 400 }
    );
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: String(e) } },
      { status: 400 }
    );
  }

  const decision = body.decision as AdminDecision;
  await adminDecide(assignmentId, session.email, decision);

  let knowledgeTaskId: number | null = null;
  if (decision === "request_supplement" && body.knowledgeTask) {
    const { createKnowledgeTask } = await import("@/lib/onboarding/knowledge-task");
    knowledgeTaskId = await createKnowledgeTask({
      createdByEmail: session.email,
      createdByRole: "admin",
      topic: body.knowledgeTask.topic,
      audience: body.knowledgeTask.audience,
      level: body.knowledgeTask.level,
      deadlineDays: body.knowledgeTask.deadlineDays,
      levelBased: body.knowledgeTask.levelBased,
      relatedAssignmentId: assignmentId,
    });
  }

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "onboarding.assignment.decided",
    metadata: { assignmentId, decision, knowledgeTaskId },
  });

  return NextResponse.json({
    ok: true,
    data: { id: assignmentId, decision, knowledgeTaskId },
  });
}
