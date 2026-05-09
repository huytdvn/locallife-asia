import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import {
  buildDocUpdate,
  EditorError,
  getFullDoc,
} from "@/lib/knowledge-editor";
import { commitUpdateDirect, GithubError } from "@/lib/github";
import { triggerKnowledgeSync } from "@/lib/sync-trigger";
import { writeAudit } from "@/lib/audit";
import { zoneOf, type Role } from "@/lib/rbac";

export const runtime = "nodejs";

const bodySchema = z.object({
  // Identifier — cho phép dùng 1 trong 2: id (ulid) HOẶC path tương đối.
  id: z.string().optional(),
  path: z.string().optional(),
  audience: z.array(z.enum(["employee", "lead", "admin"])).min(1),
});

/**
 * POST /api/admin/docs/quick-approve
 * { id?, path?, audience: Role[] }
 *
 * Inline duyệt nhanh từ training builder: thêm các role vào FM.audience
 * (UNION, không ghi đè). Giới hạn ở 3 internal role — host/lok/guest cần
 * move doc sang zone tương ứng (out-of-scope cho quick action).
 *
 * Reuse buildDocUpdate + commitUpdateDirect như admin/docs/[id] PUT để
 * đảm bảo audit trail + sync chuẩn (GitHub → mount → R2).
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body cần { id|path, audience: Role[] (chỉ employee/lead/admin) }" },
      { status: 400 }
    );
  }
  if (!parsed.data.id && !parsed.data.path) {
    return NextResponse.json({ error: "Cần id hoặc path" }, { status: 400 });
  }

  // Resolve doc bằng id hoặc path.
  let docId = parsed.data.id;
  if (!docId && parsed.data.path) {
    const { listDocs } = await import("@/lib/knowledge-editor");
    const found = listDocs().find((d) => d.path === parsed.data.path);
    if (!found) {
      return NextResponse.json({ error: "Không tìm thấy doc theo path" }, { status: 404 });
    }
    docId = found.id;
  }
  if (!docId) {
    return NextResponse.json({ error: "doc_id_required" }, { status: 400 });
  }

  const current = getFullDoc(docId);
  if (!current) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Cảnh báo zone mismatch — vẫn cho phép update audience nhưng audit lại.
  const zone = zoneOf(current.meta.path);
  const isInternalZone = zone === "internal";
  if (!isInternalZone) {
    return NextResponse.json(
      {
        error: "zone_not_internal",
        detail:
          `Doc đang ở zone "${zone}". Quick-approve chỉ áp cho zone internal. ` +
          `Move doc sang internal/ trước, hoặc edit thủ công ở /admin/docs.`,
      },
      { status: 400 }
    );
  }

  // Union audience — không xoá role cũ.
  const merged = Array.from(
    new Set<Role>([...current.meta.audience, ...parsed.data.audience])
  );
  // Nếu chỉ thêm role đã có → no-op nhưng vẫn return ok=true để UI refresh.
  const noop = merged.length === current.meta.audience.length &&
    merged.every((r) => current.meta.audience.includes(r));

  if (noop) {
    return NextResponse.json({
      ok: true,
      noop: true,
      audience: merged,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  let built;
  try {
    built = buildDocUpdate(docId, {
      fm: {
        title: current.meta.title,
        owner: current.meta.owner,
        audience: merged,
        sensitivity: current.meta.sensitivity,
        tags: current.meta.tags,
        last_reviewed: today,
        reviewer: session.email,
        status: current.meta.status,
      },
      body: current.body,
    });
  } catch (err) {
    if (err instanceof EditorError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  let commit;
  try {
    commit = await commitUpdateDirect({
      id: docId,
      rationale: `Quick-approve audience += [${parsed.data.audience.join(",")}]`,
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
    reason: `quick-approve ${docId} by ${session.email}`,
    content: built.content,
  });

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "commit_update",
    docId,
    answerExcerpt: `Quick-approve audience += [${parsed.data.audience.join(",")}]`,
    metadata: {
      kind: "quick_approve",
      added: parsed.data.audience,
      audience_after: merged,
      commit_sha: commit.commitSha,
      sync_ok: sync.ok,
    },
  });

  return NextResponse.json({
    ok: true,
    audience: merged,
    commit: { sha: commit.commitSha, url: commit.htmlUrl },
  });
}
