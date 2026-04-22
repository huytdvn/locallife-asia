import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Admin upload proxy: forward multipart request sang apps/ingest.
 *
 * Chỉ admin/lead dùng. Ghi audit log cho mỗi request.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ingestUrl = process.env.INGEST_API_URL ?? "http://localhost:8001";
  const ingestToken = process.env.INGEST_API_TOKEN ?? "";

  // Forward nguyên body multipart. Thêm Authorization cho ingest.
  const forwardHeaders: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) forwardHeaders["Content-Type"] = ct;
  if (ingestToken) forwardHeaders.Authorization = `Bearer ${ingestToken}`;

  const res = await fetch(`${ingestUrl}/upload`, {
    method: "POST",
    headers: forwardHeaders,
    body: req.body,
    // @ts-expect-error Node fetch experimental
    duplex: "half",
  });

  const data = await res.json().catch(() => ({ error: "invalid JSON from ingest" }));

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "upload",
    metadata: {
      ingest_status: res.status,
      job_id: (data as { job_id?: string }).job_id,
    },
  });

  return NextResponse.json(data, { status: res.status });
}
