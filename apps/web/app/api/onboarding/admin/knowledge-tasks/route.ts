import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { createKnowledgeTask, listForUser } from "@/lib/onboarding/knowledge-task";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const createSchema = z.object({
  topic: z.string().min(3).max(200),
  audience: z.array(z.enum(["host", "employee", "lead", "admin"])).min(1),
  level: z.enum(["entry", "mid", "senior"]).optional(),
  deadlineDays: z.number().int().min(1).max(30).default(7),
  levelBased: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden" } },
      { status: 403 }
    );
  }
  const tasks = await listForUser(session.email, session.role === "admin");
  return NextResponse.json({ ok: true, data: tasks });
}

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Chỉ admin hoặc lead được tạo task" } },
      { status: 403 }
    );
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: String(e) } },
      { status: 400 }
    );
  }

  const id = await createKnowledgeTask({
    createdByEmail: session.email,
    createdByRole: session.role as "admin" | "lead",
    topic: body.topic,
    audience: body.audience,
    level: body.level,
    deadlineDays: body.deadlineDays,
    levelBased: body.levelBased,
    notes: body.notes,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "onboarding.knowledge_task.created",
    metadata: { taskId: id, topic: body.topic, audience: body.audience },
  });

  return NextResponse.json({ ok: true, data: { id } });
}
