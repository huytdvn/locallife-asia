import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  planCrossDocChanges,
  summarizeInstruction,
} from "@/lib/ai-cross-doc";
import {
  buildCreateDoc,
  buildDeprecateUpdate,
  buildDocUpdate,
  EditorError,
  getFullDoc,
  type EditableFM,
} from "@/lib/knowledge-editor";
import type { DocMeta } from "@/lib/rbac";
import {
  commitUpdateDirect,
  draftUpdate,
  GithubError,
} from "@/lib/github";
import { triggerKnowledgeSync } from "@/lib/sync-trigger";

export const runtime = "nodejs";
export const maxDuration = 120;

const PlanBody = z.object({
  action: z.literal("plan"),
  instruction: z.string().min(8).max(2000),
});

const ApplyChangeSchema = z.object({
  key: z.string(),
  operation: z.enum(["update", "create", "fm_update", "deprecate"]),
  docId: z.string().optional(),
  docTitle: z.string(),
  docPath: z.string(),
  newPath: z.string().optional(),
  newBody: z.string().optional(),
  fmPatch: z
    .object({
      title: z.string().optional(),
      tags: z.array(z.string()).optional(),
      audience: z.array(z.string()).optional(),
      sensitivity: z.enum(["public", "internal", "restricted"]).optional(),
      last_reviewed: z.string().optional(),
      status: z.enum(["draft", "approved", "deprecated"]).optional(),
    })
    .optional(),
  deprecateReason: z.string().optional(),
  rationale: z.string(),
});

const ApplyBody = z.object({
  action: z.literal("apply"),
  instruction: z.string().min(1).max(2000),
  mode: z.enum(["commit", "pr"]),
  changes: z.array(ApplyChangeSchema).min(1).max(50),
});

const Body = z.union([PlanBody, ApplyBody]);

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "AI tổng thể chỉ dành cho admin" },
      { status: 403 }
    );
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_body", detail: err instanceof Error ? err.message : "" },
      { status: 400 }
    );
  }

  if (parsed.action === "plan") {
    return handlePlan(session, parsed);
  }
  return handleApply(session, parsed);
}

async function handlePlan(
  session: Parameters<typeof planCrossDocChanges>[0]["session"],
  body: z.infer<typeof PlanBody>
) {
  try {
    const result = await planCrossDocChanges({
      session,
      instruction: body.instruction,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "chat",
      query: `cross_doc_plan: ${body.instruction.slice(0, 200)}`,
      metadata: {
        ai_action: "cross_doc_plan",
        candidates: result.candidates_count,
        changes: result.changes.length,
      },
    });
    return NextResponse.json({
      changes: result.changes,
      candidates_count: result.candidates_count,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "plan_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

interface ApplyResult {
  key: string;
  ok: boolean;
  prUrl?: string;
  commitSha?: string;
  error?: string;
}

async function handleApply(
  session: Parameters<typeof planCrossDocChanges>[0]["session"],
  body: z.infer<typeof ApplyBody>
) {
  const summary = await summarizeInstruction(body.instruction).catch(
    () => body.instruction.slice(0, 80)
  );
  const batchId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const commitMessage = (changeRationale: string) =>
    `[ai-tổng-thể:${batchId}] ${summary} — ${changeRationale.slice(0, 100)}`;

  const results: ApplyResult[] = [];

  for (const change of body.changes) {
    try {
      if (change.operation === "update") {
        if (!change.docId || !change.newBody) {
          throw new Error("missing docId/newBody");
        }
        await applyUpdate({
          actorEmail: session.email,
          docId: change.docId,
          newBody: change.newBody,
          mode: body.mode,
          message: commitMessage(change.rationale),
          rationale: change.rationale,
        });
        results.push({ key: change.key, ok: true });
      } else if (change.operation === "fm_update") {
        if (!change.docId || !change.fmPatch) {
          throw new Error("missing docId/fmPatch");
        }
        await applyFmUpdate({
          actorEmail: session.email,
          docId: change.docId,
          fmPatch: change.fmPatch,
          mode: body.mode,
          message: commitMessage(change.rationale),
          rationale: change.rationale,
        });
        results.push({ key: change.key, ok: true });
      } else if (change.operation === "deprecate") {
        if (!change.docId) throw new Error("missing docId");
        await applyDeprecate({
          actorEmail: session.email,
          docId: change.docId,
          reason: change.deprecateReason ?? change.rationale,
          mode: body.mode,
          message: commitMessage(change.rationale),
          rationale: change.rationale,
        });
        results.push({ key: change.key, ok: true });
      } else if (change.operation === "create") {
        if (!change.newPath || !change.newBody) {
          throw new Error("missing newPath/newBody");
        }
        await applyCreate({
          actorEmail: session.email,
          newPath: change.newPath,
          docTitle: change.docTitle,
          newBody: change.newBody,
          mode: body.mode,
          message: commitMessage(change.rationale),
          rationale: change.rationale,
        });
        results.push({ key: change.key, ok: true });
      }
    } catch (err) {
      const msg =
        err instanceof EditorError || err instanceof GithubError || err instanceof Error
          ? err.message
          : "unknown";
      results.push({ key: change.key, ok: false, error: msg });
    }

    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "commit_update",
      docId: change.docId,
      query: `cross_doc_apply: ${body.instruction.slice(0, 200)}`,
      metadata: {
        ai_action: "cross_doc_apply",
        batch_id: batchId,
        operation: change.operation,
        mode: body.mode,
        change_key: change.key,
      },
    });
  }

  // After all writes, fire-and-forget sync to refresh local + R2 mounts.
  triggerKnowledgeSync({}).catch(() => undefined);

  return NextResponse.json({
    batchId,
    summary,
    results,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}

async function applyUpdate(args: {
  actorEmail: string;
  docId: string;
  newBody: string;
  mode: "commit" | "pr";
  message: string;
  rationale: string;
}) {
  const current = getFullDoc(args.docId);
  if (!current) throw new EditorError("Doc không tồn tại");
  const fm: EditableFM = fmFromMeta(current.meta);
  fm.last_reviewed = today();
  const built = buildDocUpdate(args.docId, { fm, body: args.newBody });
  await dispatchCommit({
    mode: args.mode,
    docId: args.docId,
    repoPath: built.repoPath,
    content: built.content,
    rationale: args.rationale,
    actorEmail: args.actorEmail,
    message: args.message,
  });
}

async function applyFmUpdate(args: {
  actorEmail: string;
  docId: string;
  fmPatch: NonNullable<z.infer<typeof ApplyChangeSchema>["fmPatch"]>;
  mode: "commit" | "pr";
  message: string;
  rationale: string;
}) {
  const current = getFullDoc(args.docId);
  if (!current) throw new EditorError("Doc không tồn tại");
  const fm: EditableFM = fmFromMeta(current.meta);
  if (args.fmPatch.title) fm.title = args.fmPatch.title;
  if (args.fmPatch.tags) fm.tags = args.fmPatch.tags;
  if (args.fmPatch.audience) {
    fm.audience = args.fmPatch.audience.filter((a): a is EditableFM["audience"][number] =>
      ["employee", "lead", "admin"].includes(a)
    ) as EditableFM["audience"];
  }
  if (args.fmPatch.sensitivity) fm.sensitivity = args.fmPatch.sensitivity;
  if (args.fmPatch.last_reviewed) fm.last_reviewed = args.fmPatch.last_reviewed;
  if (args.fmPatch.status) fm.status = args.fmPatch.status;

  const built = buildDocUpdate(args.docId, { fm, body: current.body });
  await dispatchCommit({
    mode: args.mode,
    docId: args.docId,
    repoPath: built.repoPath,
    content: built.content,
    rationale: args.rationale,
    actorEmail: args.actorEmail,
    message: args.message,
  });
}

async function applyDeprecate(args: {
  actorEmail: string;
  docId: string;
  reason: string;
  mode: "commit" | "pr";
  message: string;
  rationale: string;
}) {
  const built = buildDeprecateUpdate(args.docId, args.reason);
  await dispatchCommit({
    mode: args.mode,
    docId: args.docId,
    repoPath: built.repoPath,
    content: built.content,
    rationale: args.rationale,
    actorEmail: args.actorEmail,
    message: args.message,
  });
}

async function applyCreate(args: {
  actorEmail: string;
  newPath: string;
  docTitle: string;
  newBody: string;
  mode: "commit" | "pr";
  message: string;
  rationale: string;
}) {
  const today_ = today();
  const fm: EditableFM = {
    title: args.docTitle,
    owner: args.actorEmail,
    audience: ["employee", "lead", "admin"],
    sensitivity: "internal",
    tags: [],
    last_reviewed: today_,
    reviewer: args.actorEmail,
    status: "draft",
  };
  const built = buildCreateDoc({ path: args.newPath, fm, body: args.newBody });
  await dispatchCommit({
    mode: args.mode,
    docId: built.preview.id,
    repoPath: built.repoPath,
    content: built.content,
    rationale: args.rationale,
    actorEmail: args.actorEmail,
    message: args.message,
  });
}

async function dispatchCommit(args: {
  mode: "commit" | "pr";
  docId: string;
  repoPath: string;
  content: string;
  rationale: string;
  actorEmail: string;
  message: string;
}) {
  if (args.mode === "pr") {
    await draftUpdate({
      id: args.docId,
      rationale: args.rationale,
      newContent: args.content,
      repoPath: args.repoPath,
      actorEmail: args.actorEmail,
    });
    return;
  }
  await commitUpdateDirect({
    id: args.docId,
    rationale: args.message,
    newContent: args.content,
    repoPath: args.repoPath,
    actorEmail: args.actorEmail,
  });
}

function fmFromMeta(meta: DocMeta): EditableFM {
  return {
    title: meta.title,
    owner: meta.owner,
    audience: meta.audience as EditableFM["audience"],
    sensitivity: meta.sensitivity,
    tags: meta.tags,
    last_reviewed: meta.last_reviewed,
    reviewer: meta.reviewer,
    status: meta.status,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
