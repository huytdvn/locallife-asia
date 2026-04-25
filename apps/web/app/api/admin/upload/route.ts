import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Admin upload proxy: parse form data từ browser, forward sang apps/ingest.
 * Chỉ admin/lead dùng. Audit mỗi request.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ingestUrl = process.env.INGEST_API_URL ?? "http://localhost:8001";
  const ingestToken = process.env.INGEST_API_TOKEN ?? "";

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `invalid form data: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  // Rebuild FormData và forward (tránh streaming body qua fetch Next.js 15).
  const forwarded = new FormData();
  for (const [key, value] of form.entries()) {
    forwarded.append(key, value);
  }

  const headers: Record<string, string> = {};
  if (ingestToken) headers.Authorization = `Bearer ${ingestToken}`;

  let res: Response;
  try {
    res = await fetch(`${ingestUrl}/upload`, {
      method: "POST",
      headers,
      body: forwarded,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "cannot reach ingest service",
        detail: err instanceof Error ? err.message : String(err),
        hint: "Đảm bảo apps/ingest đang chạy: `cd apps/ingest && uvicorn app.main:app --port 8001`",
      },
      { status: 502 }
    );
  }

  const data = await res
    .json()
    .catch(() => ({ error: "invalid JSON from ingest" }));

  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "upload",
    metadata: {
      ingest_status: res.status,
      filename: form.get("file") instanceof File ? (form.get("file") as File).name : null,
      job_id: (data as { job_id?: string }).job_id,
    },
  });

  return NextResponse.json(data, { status: res.status });
}
