import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  deleteOnboardingFlow,
  getOnboardingFlow,
  updateOnboardingFlow,
} from "@/lib/admin-builders/persistence";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const docSchema = z.object({
  doc_path: z.string().min(1),
  heading_anchor: z.string().nullable(),
  highlight: z.string().max(500),
  reason: z.string().max(300),
});

const questionSchema = z.object({
  prompt: z.string().min(1).max(500),
  choices: z.array(z.string().min(1)).min(2).max(6).default([]),
  answer_idx: z.number().int().min(0).max(5).default(0),
  explanation: z.string().max(500).default(""),
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

const updateSchema = z.object({
  draft: z.object({
    title: z.string().min(1).max(120),
    motto: z.string().max(200),
    pass_threshold: z.number().int().min(40).max(95),
    steps: z.array(stepSchema).min(1).max(10),
  }),
  brief: z.string().max(2000).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Draft không hợp lệ", detail: parsed.error.format() },
      { status: 400 }
    );
  }
  try {
    const ok = await updateOnboardingFlow({
      id: flowId,
      draft: parsed.data.draft,
      brief: parsed.data.brief ?? null,
      updatedBy: session.email,
    });
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: { kind: "onboarding_flow_update", flow_id: flowId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "update_failed" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const flow = await getOnboardingFlow(flowId);
  if (!flow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ flow });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const ok = await deleteOnboardingFlow(flowId);
  if (!ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { kind: "onboarding_flow_delete", flow_id: flowId },
  });
  return NextResponse.json({ ok: true });
}
