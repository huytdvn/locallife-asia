import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  listOnboardingFlows,
  saveOnboardingFlow,
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
  expected_keywords: z.array(z.string()).max(10),
  min_keywords: z.number().int().min(1).max(10),
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
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "role_upsert",
      metadata: {
        kind: "onboarding_flow_create",
        flow_id: id,
        title: parsed.data.draft.title,
        steps: parsed.data.draft.steps.length,
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
