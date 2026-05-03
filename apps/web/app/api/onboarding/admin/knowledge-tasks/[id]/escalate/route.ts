import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { escalate, getById } from "@/lib/onboarding/knowledge-task";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  toEmail: z.string().email(),
  notes: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Chỉ admin được escalate" } },
      { status: 403 }
    );
  }
  const { id } = await params;
  const taskId = Number(id);
  const task = await getById(taskId);
  if (!task) {
    return NextResponse.json({ ok: false, error: { code: "not_found" } }, { status: 404 });
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

  await escalate(taskId, body.toEmail, body.notes);
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "onboarding.knowledge_task.created", // reuse — could add `.escalated` if granular
    metadata: { taskId, escalatedTo: body.toEmail, action: "escalate" },
  });

  return NextResponse.json({ ok: true, data: { id: taskId, escalatedTo: body.toEmail } });
}
