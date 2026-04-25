import { isEnabled, query } from "@/lib/db";

/**
 * Ghi audit log vào Postgres. No-op khi DB không khả dụng — để chatbot
 * vẫn chạy được ở dev không có Postgres.
 */

export interface AuditEntry {
  actorEmail: string;
  role: string;
  action:
    | "chat"
    | "widget_chat"
    | "draft_update"
    | "commit_update"
    | "upload"
    | "webhook"
    | "role_upsert"
    | "role_disable";
  docId?: string;
  query?: string;
  answerExcerpt?: string;
  citations?: string[];
  toolCalls?: Array<{ name: string; input: unknown; resultLength: number }>;
  metadata?: Record<string, unknown>;
}

let auditWarned = false;

export async function writeAudit(entry: AuditEntry): Promise<void> {
  if (!isEnabled()) return;
  try {
    await query(
      `INSERT INTO audit_log
         (actor_email, role, action, doc_id, query, answer_excerpt, citations, tool_calls, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        entry.actorEmail,
        entry.role,
        entry.action,
        entry.docId ?? null,
        entry.query ?? null,
        entry.answerExcerpt ? entry.answerExcerpt.slice(0, 500) : null,
        entry.citations ?? null,
        entry.toolCalls ? JSON.stringify(entry.toolCalls) : null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (err) {
    if (!auditWarned) {
      console.warn("[audit] write failed (suppressing repeats):", err instanceof Error ? err.message : err);
      auditWarned = true;
    }
  }
}

export async function recordUnmatchedQuery(
  actorEmail: string | null,
  role: string | null,
  q: string
): Promise<void> {
  if (!isEnabled()) return;
  try {
    await query(
      `INSERT INTO unmatched_queries (query, actor_email, role) VALUES ($1, $2, $3)`,
      [q, actorEmail, role]
    );
  } catch (err) {
    console.error("[unmatched] write failed:", err);
  }
}
