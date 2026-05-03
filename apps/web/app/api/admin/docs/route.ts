import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  EditorError,
  buildCreateDoc,
  listDocs,
  type EditableFM,
} from "@/lib/knowledge-editor";
import { commitUpdateDirect, GithubError } from "@/lib/github";
import { triggerKnowledgeSync } from "@/lib/sync-trigger";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ docs: listDocs() });
}

/**
 * POST /api/admin/docs — tạo tài liệu mới.
 * Chỉ admin. Path phải nằm trong zone hợp lệ (internal/host/lok/public/inbox).
 * Ghi tier 1 (GitHub) trước, sync tier 2/3 best-effort.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "only_admin" }, { status: 403 });
  }
  let body: { path?: string; fm?: EditableFM; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.path || !body.fm || !body.body) {
    return NextResponse.json(
      { error: "missing_fields", required: ["path", "fm", "body"] },
      { status: 400 }
    );
  }

  let built;
  try {
    built = buildCreateDoc({ path: body.path, fm: body.fm, body: body.body });
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
      id: built.preview.id,
      rationale: `Create via admin UI: ${built.preview.title}`,
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
    reason: `create ${built.preview.id} by ${session.email}`,
    content: built.content,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "commit_update",
    docId: built.preview.id,
    answerExcerpt: `Create doc: ${built.preview.title}`,
    metadata: {
      created: true,
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
