import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { isEnabled, query } from "@/lib/db";
import { knowledgeRoot, loadKnowledge } from "@/lib/knowledge-loader";

export const runtime = "nodejs";

interface AuditEntry {
  ts: string;
  actor_email: string;
  role: string;
  action: string;
  doc_id: string | null;
  doc_title?: string | null;
  doc_path?: string | null;
  query?: string | null;
  answer_excerpt?: string | null;
  metadata?: Record<string, unknown> | null;
  source: "db" | "filesystem";
}

/**
 * GET /api/admin/audit?doc_id=<id>&limit=<n>&action=<kind>
 *
 * 2 nguồn:
 *   1. Postgres `audit_log` (real history với actor + metadata đầy đủ)
 *   2. File mtime fallback — luôn có, nhanh
 *
 * Trả cả 2 (DB nếu có, bổ sung mtime cho docs chưa có DB entry).
 */
export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const docId = url.searchParams.get("doc_id");
  const action = url.searchParams.get("action");
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "30", 10));

  const entries: AuditEntry[] = [];

  // 1. From DB if available
  if (isEnabled()) {
    try {
      const where: string[] = [];
      const args: unknown[] = [];
      if (docId) {
        args.push(docId);
        where.push(`doc_id = $${args.length}`);
      }
      if (action) {
        args.push(action);
        where.push(`action = $${args.length}`);
      }
      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      args.push(limit);
      const rows = await query<{
        ts: string;
        actor_email: string;
        role: string;
        action: string;
        doc_id: string | null;
        query: string | null;
        answer_excerpt: string | null;
        metadata: Record<string, unknown> | null;
      }>(
        `SELECT ts, actor_email, role, action, doc_id, query, answer_excerpt, metadata
         FROM audit_log ${whereClause}
         ORDER BY ts DESC
         LIMIT $${args.length}`,
        args
      );
      for (const r of rows) {
        entries.push({ ...r, source: "db" });
      }
    } catch (err) {
      // DB errors are non-fatal — fall through to fs
      console.warn("[audit api] db error:", err);
    }
  }

  // 2. Filesystem mtime (always add — gives baseline "last updated" info)
  try {
    const docs = loadKnowledge();
    const root = knowledgeRoot();
    const fsEntries: AuditEntry[] = [];
    for (const d of docs) {
      if (docId && d.meta.id !== docId) continue;
      const abs = path.join(root, d.meta.path);
      try {
        const st = fs.statSync(abs);
        fsEntries.push({
          ts: st.mtime.toISOString(),
          actor_email: d.meta.reviewer || d.meta.owner || "unknown",
          role: "system",
          action: "file_mtime",
          doc_id: d.meta.id,
          doc_title: d.meta.title,
          doc_path: d.meta.path,
          metadata: {
            size_bytes: st.size,
            status: d.meta.status,
            last_reviewed: d.meta.last_reviewed,
          },
          source: "filesystem",
        });
      } catch {
        continue;
      }
    }
    fsEntries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    // Merge: DB entries lên đầu, fs bổ sung sau (dedup theo doc_id + action=file_mtime)
    const seenIds = new Set(entries.filter((e) => e.doc_id).map((e) => e.doc_id!));
    for (const e of fsEntries) {
      if (seenIds.has(e.doc_id!)) continue;
      entries.push(e);
    }
  } catch (err) {
    console.warn("[audit api] fs error:", err);
  }

  // Enrich DB entries with title/path if missing
  if (entries.some((e) => e.doc_id && !e.doc_title)) {
    const docs = loadKnowledge();
    const byId = new Map(docs.map((d) => [d.meta.id, d.meta]));
    for (const e of entries) {
      if (e.doc_id && !e.doc_title) {
        const m = byId.get(e.doc_id);
        if (m) {
          e.doc_title = m.title;
          e.doc_path = m.path;
        }
      }
    }
  }

  entries.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return NextResponse.json({
    entries: entries.slice(0, limit),
    sources: {
      db: isEnabled() ? "available" : "disabled",
      filesystem: "always",
    },
  });
}
