import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  EditorError,
  authorizeHardDelete,
  buildDeprecateUpdate,
  buildDocUpdate,
  getFullDoc,
  type EditableFM,
} from "@/lib/knowledge-editor";
import { commitUpdateDirect, GithubError } from "@/lib/github";
import { triggerKnowledgeSync } from "@/lib/sync-trigger";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const doc = getFullDoc(id);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "only admin can edit" },
      { status: 403 }
    );
  }
  const { id } = await params;
  let body: { fm: EditableFM; body: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  let built;
  try {
    built = buildDocUpdate(id, body);
  } catch (err) {
    if (err instanceof EditorError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }

  // Tier 1 — commit lên GitHub (source of truth). Fail ở đây = save fail.
  let commit;
  try {
    commit = await commitUpdateDirect({
      id,
      rationale: `Edit via admin UI: ${built.preview.title}`,
      newContent: built.content,
      repoPath: built.repoPath,
      actorEmail: session.email,
    });
  } catch (err) {
    const msg =
      err instanceof GithubError || err instanceof Error
        ? err.message
        : "github commit failed";
    return NextResponse.json({ error: msg, stage: "github" }, { status: 502 });
  }

  // Tier 2/3 — trigger sync mount + R2 (best-effort, không chặn save).
  const sync = await triggerKnowledgeSync({
    changedPath: built.repoPath,
    reason: `admin edit ${id} by ${session.email}`,
    content: built.content,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "commit_update",
    docId: id,
    answerExcerpt: `Edit via admin UI: ${built.preview.title}`,
    metadata: {
      path: built.preview.path,
      status: built.preview.status,
      commit_sha: commit.commitSha,
      commit_url: commit.htmlUrl,
      sync_ok: sync.ok,
      sync_error: sync.error,
      r2: sync.r2,
    },
  });

  return NextResponse.json({
    ok: true,
    meta: built.preview,
    commit: { sha: commit.commitSha, url: commit.htmlUrl },
    sync,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "only admin" }, { status: 403 });
  }
  const { id } = await params;
  const url = new URL(req.url);
  const reason = url.searchParams.get("reason") ?? "no reason";
  const hard = url.searchParams.get("hard") === "true";

  // Hard delete: BẮT BUỘC password trong body (không bao giờ qua query).
  if (hard) {
    let bodyJson: { password?: string } = {};
    try {
      bodyJson = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Hard delete cần JSON body { password }" },
        { status: 400 }
      );
    }
    const password = bodyJson.password;
    if (!password) {
      return NextResponse.json(
        {
          error:
            "Hard delete bị chặn để tránh phá hoại dữ liệu. Cần password xác minh danh tính.",
        },
        { status: 403 }
      );
    }
    let target: { repoPath: string; relPath: string };
    try {
      target = authorizeHardDelete(id, password);
    } catch (err) {
      const msg =
        err instanceof EditorError
          ? err.message
          : err instanceof Error
            ? err.message
            : "unknown";
      // Audit fail attempt (potential sabotage signal)
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "commit_update",
        docId: id,
        answerExcerpt: "HARD DELETE REJECTED",
        metadata: { hard_delete: false, reason: msg },
      });
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    // Xoá trên GitHub qua contents API.
    let commitSha: string | undefined;
    try {
      const { deleteFileOnRemote } = await import("@/lib/github");
      const res = await deleteFileOnRemote({
        repoPath: target.repoPath,
        message: `HARD DELETE ${id} by ${session.email}: ${reason}`,
      });
      commitSha = res.commitSha;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "github delete failed";
      return NextResponse.json(
        { error: msg, stage: "github" },
        { status: 502 }
      );
    }

    const sync = await triggerKnowledgeSync({
      changedPath: target.repoPath,
      reason: `hard delete ${id} by ${session.email}`,
    });

    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "commit_update",
      docId: id,
      answerExcerpt: `HARD DELETE: ${reason}`,
      metadata: {
        hard_delete: true,
        path: target.relPath,
        commit_sha: commitSha,
        sync_ok: sync.ok,
        sync_error: sync.error,
      },
    });
    return NextResponse.json({
      ok: true,
      hardDeleted: target.relPath,
      commit: { sha: commitSha },
      sync,
    });
  }

  // Soft delete (deprecate) — safe default
  let built;
  try {
    built = buildDeprecateUpdate(id, reason);
  } catch (err) {
    if (err instanceof EditorError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }

  let commit;
  try {
    commit = await commitUpdateDirect({
      id,
      rationale: `Deprecate via admin UI: ${reason}`,
      newContent: built.content,
      repoPath: built.repoPath,
      actorEmail: session.email,
    });
  } catch (err) {
    const msg =
      err instanceof GithubError || err instanceof Error
        ? err.message
        : "github commit failed";
    return NextResponse.json({ error: msg, stage: "github" }, { status: 502 });
  }

  const sync = await triggerKnowledgeSync({
    changedPath: built.repoPath,
    reason: `deprecate ${id} by ${session.email}`,
    content: built.content,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "commit_update",
    docId: id,
    answerExcerpt: `Deprecated: ${reason}`,
    metadata: {
      path: built.preview.path,
      commit_sha: commit.commitSha,
      sync_ok: sync.ok,
      sync_error: sync.error,
    },
  });

  return NextResponse.json({
    ok: true,
    meta: built.preview,
    commit: { sha: commit.commitSha, url: commit.htmlUrl },
    sync,
  });
}
