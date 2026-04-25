import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  EditorError,
  createDoc,
  listDocs,
  type EditableFM,
} from "@/lib/knowledge-editor";
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
  try {
    const meta = createDoc({ path: body.path, fm: body.fm, body: body.body });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "commit_update",
      docId: meta.id,
      answerExcerpt: `Create doc: ${meta.title}`,
      metadata: { created: true, path: meta.path },
    });
    return NextResponse.json({ ok: true, meta });
  } catch (err) {
    if (err instanceof EditorError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
