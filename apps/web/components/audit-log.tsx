"use client";

import { useEffect, useState } from "react";

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

interface Props {
  /** Khi có docId: chỉ hiện audit của doc đó. Bỏ trống: tất cả. */
  docId?: string;
  /** Compact view cho sidebar — ít padding, hiện ít entry. */
  compact?: boolean;
  limit?: number;
}

const ACTION_LABEL: Record<string, { vi: string; color: string }> = {
  chat: { vi: "Chat hỏi", color: "#6b7280" },
  commit_update: { vi: "Cập nhật/tạo", color: "var(--ll-green-bright)" },
  draft_update: { vi: "Đề xuất sửa", color: "#b8932a" },
  upload: { vi: "Nạp file mới", color: "var(--ll-orange)" },
  webhook: { vi: "Webhook sync", color: "#6b7280" },
  file_mtime: { vi: "Chỉnh sửa file", color: "#8b5cf6" },
};

export function AuditLog({ docId, compact = false, limit = 20 }: Props) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (docId) params.set("doc_id", docId);
    params.set("limit", String(limit));
    fetch(`/api/admin/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch((e) => setError(String(e)));
  }, [docId, limit]);

  if (error) {
    return (
      <div style={{ fontSize: 12, color: "#b91c1c", padding: 8 }}>
        Không tải được audit: {error}
      </div>
    );
  }
  if (entries === null) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--ll-muted)",
          padding: 8,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span className="ll-typing">
          <span />
          <span />
          <span />
        </span>
        Đang tải audit…
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--ll-muted)",
          padding: compact ? 8 : 16,
          fontStyle: "italic",
        }}
      >
        Chưa có log nào.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 6,
        padding: compact ? 0 : 4,
      }}
    >
      {entries.map((e, i) => (
        <AuditRow key={`${e.ts}-${i}`} entry={e} compact={compact} showDoc={!docId} />
      ))}
    </div>
  );
}

function AuditRow({
  entry,
  compact,
  showDoc,
}: {
  entry: AuditEntry;
  compact: boolean;
  showDoc: boolean;
}) {
  const meta = ACTION_LABEL[entry.action] ?? { vi: entry.action, color: "#6b7280" };
  const ts = new Date(entry.ts);
  const relative = formatRelative(ts);
  const actorShort =
    entry.actor_email.split("@")[0] ?? entry.actor_email;
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: compact ? "6px 8px" : "8px 10px",
        borderRadius: 6,
        background: "var(--ll-surface-soft)",
        border: "1px solid var(--ll-border)",
        fontSize: compact ? 11 : 12,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: meta.color,
          marginTop: 5,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontWeight: 600,
              color: "var(--ll-ink)",
            }}
          >
            {meta.vi}
          </span>
          <span style={{ color: "var(--ll-muted)" }}>
            · {actorShort} ({entry.role})
          </span>
          <span style={{ color: "var(--ll-muted)", marginLeft: "auto" }} title={ts.toLocaleString("vi-VN")}>
            {relative}
          </span>
        </div>
        {showDoc && entry.doc_title && (
          <div
            style={{
              fontSize: compact ? 11 : 12,
              color: "var(--ll-ink-soft)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            📄 {entry.doc_title}
          </div>
        )}
        {entry.doc_path && !showDoc && (
          <div
            style={{
              fontSize: 10,
              color: "var(--ll-muted)",
              fontFamily: "monospace",
              marginTop: 2,
            }}
          >
            {entry.doc_path}
          </div>
        )}
        {entry.query && (
          <div
            style={{
              fontSize: 11,
              color: "var(--ll-muted)",
              marginTop: 2,
              fontStyle: "italic",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            “{entry.query.slice(0, 80)}”
          </div>
        )}
        {entry.answer_excerpt && (
          <div
            style={{
              fontSize: 11,
              color: "var(--ll-ink-soft)",
              marginTop: 2,
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.answer_excerpt.slice(0, 100)}
          </div>
        )}
        {renderMetaBadges(entry.metadata)}
        {entry.source === "filesystem" && (
          <div
            style={{
              fontSize: 10,
              color: "var(--ll-muted)",
              marginTop: 2,
            }}
          >
            ⓘ Ước tính từ mtime file — enable Postgres để thấy log chi tiết
          </div>
        )}
      </div>
    </div>
  );
}

function renderMetaBadges(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  const badges: React.ReactNode[] = [];
  if (metadata.hard_delete === true) {
    badges.push(
      <span key="hd" className="ll-badge" style={{ background: "#fee2e2", color: "#b91c1c" }}>
        HARD DELETE
      </span>
    );
  }
  if (metadata.hard_delete === false) {
    badges.push(
      <span key="hdr" className="ll-badge" style={{ background: "#fef3c7", color: "#c07600" }}>
        DELETE REJECTED
      </span>
    );
  }
  if (metadata.created === true) {
    badges.push(
      <span key="cr" className="ll-badge" style={{ background: "var(--ll-green-soft)", color: "var(--ll-green-dark)" }}>
        NEW
      </span>
    );
  }
  if (metadata.ai_action) {
    badges.push(
      <span key="ai" className="ll-badge" style={{ background: "#ede9fe", color: "#6b21a8" }}>
        AI {String(metadata.ai_action)}
      </span>
    );
  }
  if (metadata.pr_url) {
    badges.push(
      <a
        key="pr"
        href={String(metadata.pr_url)}
        target="_blank"
        rel="noreferrer"
        className="ll-badge"
        style={{ background: "#dbeafe", color: "#1e40af", textDecoration: "none" }}
      >
        PR →
      </a>
    );
  }
  if (badges.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{badges}</div>
  );
}

function formatRelative(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return "vừa xong";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const dy = Math.floor(h / 24);
  if (dy < 30) return `${dy} ngày trước`;
  return d.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}
