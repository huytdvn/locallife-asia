import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  EditorError,
  deprecateDoc,
  getFullDoc,
  hardDeleteDoc,
  writeDoc,
  type EditableFM,
} from "@/lib/knowledge-editor";
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
  try {
    const meta = writeDoc(id, body);
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "commit_update",
      docId: id,
      answerExcerpt: `Edit via admin UI: ${meta.title}`,
      metadata: { path: meta.path, status: meta.status },
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
    try {
      const res = hardDeleteDoc(id, password);
      // NEVER log password. Ghi nhận delete + actor.
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "commit_update",
        docId: id,
        answerExcerpt: `HARD DELETE: ${reason}`,
        metadata: { hard_delete: true, path: res.deleted },
      });
      return NextResponse.json({ ok: true, hardDeleted: res.deleted });
    } catch (err) {
      if (err instanceof EditorError) {
        // Audit fail attempt (potential sabotage signal)
        await writeAudit({
          actorEmail: session.email,
          role: session.role,
          action: "commit_update",
          docId: id,
          answerExcerpt: "HARD DELETE REJECTED",
          metadata: { hard_delete: false, reason: err.message },
        });
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "unknown" },
        { status: 500 }
      );
    }
  }

  // Soft delete (deprecate) — safe default
  try {
    const meta = deprecateDoc(id, reason);
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "commit_update",
      docId: id,
      answerExcerpt: `Deprecated: ${reason}`,
      metadata: { path: meta.path },
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
