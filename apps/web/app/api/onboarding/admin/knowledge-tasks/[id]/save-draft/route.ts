import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getById, setStatus } from "@/lib/onboarding/knowledge-task";
import { buildCreateDoc } from "@/lib/knowledge-editor";
import { commitUpdateDirect } from "@/lib/github";
import { triggerKnowledgeSync } from "@/lib/sync-trigger";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Lưu nháp AI đã generate thành 1 doc draft trong `knowledge/`. Đi qua
 * tier-1 flow (git commit) hiện có — admin sẽ approve sau qua /admin/docs.
 *
 * Ngắn gọn: thay vì admin copy-paste markdown ra ngoài, gọi endpoint này
 * → doc xuất hiện trong knowledge tree với status=draft + audience tương
 * ứng task. Knowledge_task chuyển sang `pr_open`.
 */

const fmSchema = z.object({
  title: z.string().min(3).max(200),
  audience: z.array(z.enum(["host", "employee", "lead", "admin"])).min(1),
  sensitivity: z.enum(["public", "internal", "restricted"]).default("internal"),
  tags: z.array(z.string()).default([]),
  reviewer: z.string().email().optional(),
});

const bodySchema = z.object({
  path: z.string().min(3).max(300).regex(/\.md$/),
  fm: fmSchema,
  body: z.string().min(50),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Chỉ admin được lưu draft vào knowledge" } },
      { status: 403 }
    );
  }
  const { id } = await params;
  const taskId = Number(id);
  const task = await getById(taskId);
  if (!task) {
    return NextResponse.json({ ok: false, error: { code: "not_found" } }, { status: 404 });
  }

  let input;
  try {
    input = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: String(e) } },
      { status: 400 }
    );
  }

  // Build doc với FM đầy đủ (status=draft, owner=task creator).
  const fm = {
    title: input.fm.title,
    owner: task.createdByEmail,
    audience: input.fm.audience,
    sensitivity: input.fm.sensitivity,
    tags: ["onboarding", "ai-drafted", ...input.fm.tags].filter((v, i, a) => a.indexOf(v) === i),
    last_reviewed: new Date().toISOString().slice(0, 10),
    reviewer: input.fm.reviewer ?? session.email,
    status: "draft" as const,
  };

  let built;
  try {
    built = buildCreateDoc({ path: input.path, fm, body: input.body });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "build_fail", message: e instanceof Error ? e.message : String(e) },
      },
      { status: 400 }
    );
  }

  let prUrl: string | null = null;
  try {
    const commit = await commitUpdateDirect({
      id: built.preview.id,
      rationale: `docs(knowledge): AI draft from onboarding task #${taskId} — ${input.fm.title}`,
      newContent: built.content,
      repoPath: built.repoPath,
      actorEmail: session.email,
    });
    prUrl = commit.htmlUrl;
    await triggerKnowledgeSync({
      changedPath: built.repoPath,
      reason: `onboarding task #${taskId}`,
      content: built.content,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "commit_fail", message: e instanceof Error ? e.message : String(e) },
      },
      { status: 502 }
    );
  }

  await setStatus(taskId, "pr_open", { prUrl: prUrl ?? undefined });
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "draft_update",
    docId: built.preview.id,
    metadata: {
      knowledgeTaskId: taskId,
      path: built.repoPath,
      action: "save_draft_from_ai",
    },
  });

  return NextResponse.json({
    ok: true,
    data: {
      taskId,
      docId: built.preview.id,
      path: built.repoPath,
      prUrl,
      previewUrl: `/admin/docs?id=${built.preview.id}`,
    },
  });
}
