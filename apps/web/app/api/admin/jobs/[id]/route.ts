import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Proxy job status từ ingest về web client. Dùng bởi UI admin poll.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const ingestUrl = process.env.INGEST_API_URL ?? "http://localhost:8001";
  const ingestToken = process.env.INGEST_API_TOKEN ?? "";
  const headers: Record<string, string> = {};
  if (ingestToken) headers.Authorization = `Bearer ${ingestToken}`;

  try {
    const res = await fetch(`${ingestUrl}/jobs/${encodeURIComponent(id)}`, {
      headers,
    });
    const data = await res.json().catch(() => ({ status: "unknown" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "ingest unreachable", detail: String(err) },
      { status: 502 }
    );
  }
}
