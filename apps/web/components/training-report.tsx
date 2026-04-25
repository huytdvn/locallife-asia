"use client";

import { useEffect, useMemo, useState } from "react";

interface ReportRow {
  email: string;
  slug: string;
  started_at: string;
  updated_at: string;
  completed_count: number;
  quiz_best: number | null;
  quiz_passed: boolean;
  quiz_attempts: number;
  quiz_passed_at: string | null;
}

interface PathMeta {
  slug: string;
  title: string;
  total_steps: number;
}

export function TrainingReport() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [paths, setPaths] = useState<PathMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterSlug, setFilterSlug] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "passed" | "in-progress" | "failed">(
    "all"
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/training-report")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setRows(d.rows ?? []);
      })
      .catch((e) => setError(String(e)));
    fetch("/api/training")
      .then((r) => r.json())
      .then((d) =>
        setPaths(
          (d.paths ?? []).map((p: { slug: string; title: string; total_steps: number }) => ({
            slug: p.slug,
            title: p.title,
            total_steps: p.total_steps,
          }))
        )
      )
      .catch(() => {
        /* ignore */
      });
  }, []);

  const pathBySlug = useMemo(
    () => new Map(paths.map((p) => [p.slug, p])),
    [paths]
  );

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (filterSlug !== "all" && r.slug !== filterSlug) return false;
      if (filterStatus === "passed" && !r.quiz_passed) return false;
      if (filterStatus === "in-progress" && (r.quiz_passed || r.quiz_attempts === 0)) {
        // exclude those who passed or never tried
        // "in-progress" = đã đọc bài nhưng chưa pass quiz
        if (r.quiz_attempts > 0 && !r.quiz_passed) return true;
        return false;
      }
      if (filterStatus === "failed") {
        if (r.quiz_attempts === 0 || r.quiz_passed) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.email.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [rows, filterSlug, filterStatus, search]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const passed = rows.filter((r) => r.quiz_passed).length;
    const attempted = rows.filter((r) => r.quiz_attempts > 0).length;
    const unique = new Set(rows.map((r) => r.email)).size;
    return { total, passed, attempted, unique };
  }, [rows]);

  if (error) {
    return (
      <div className="ll-card" style={{ color: "#b91c1c" }}>
        Lỗi tải báo cáo: {error}
      </div>
    );
  }
  if (!rows) {
    return (
      <div
        className="ll-card"
        style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ll-muted)" }}
      >
        <span className="ll-typing">
          <span />
          <span />
          <span />
        </span>
        Đang tải báo cáo…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        className="ll-card"
        style={{ textAlign: "center", color: "var(--ll-muted)", padding: 40 }}
      >
        Chưa có ai bắt đầu lộ trình training nào. Chia sẻ link{" "}
        <code>/training</code> cho team để bắt đầu.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <StatCard label="Tổng attempt" value={stats.total} accent="default" />
          <StatCard label="Người tham gia" value={stats.unique} accent="blue" />
          <StatCard label="Đã làm quiz" value={stats.attempted} accent="orange" />
          <StatCard label="Pass quiz" value={stats.passed} accent="green" />
        </div>
      )}

      <div
        className="ll-card"
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: 14,
          alignItems: "center",
        }}
      >
        <input
          placeholder="Tìm email hoặc slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 200px",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--ll-border)",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />
        <select
          value={filterSlug}
          onChange={(e) => setFilterSlug(e.target.value)}
          style={selStyle}
        >
          <option value="all">Tất cả lộ trình</option>
          {paths.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.title}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(e.target.value as typeof filterStatus)
          }
          style={selStyle}
        >
          <option value="all">Mọi trạng thái</option>
          <option value="passed">Đã pass quiz</option>
          <option value="failed">Thử quiz nhưng chưa pass</option>
          <option value="in-progress">Đang học (có attempt chưa pass)</option>
        </select>
        <button
          type="button"
          onClick={() => {
            const csv = toCSV(filtered, pathBySlug);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `training-report-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--ll-green)",
            background: "var(--ll-green-soft)",
            color: "var(--ll-green-dark)",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Export CSV
        </button>
      </div>

      <div className="ll-card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 2fr) minmax(180px, 2fr) 140px 140px 110px 110px",
            gap: 12,
            padding: "10px 16px",
            borderBottom: "1px solid var(--ll-border)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ll-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            background: "var(--ll-surface-soft)",
          }}
        >
          <div>Email</div>
          <div>Lộ trình</div>
          <div>Tiến độ đọc</div>
          <div>Quiz best</div>
          <div>Trạng thái</div>
          <div>Cập nhật</div>
        </div>
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--ll-muted)" }}>
              Không có row nào khớp filter.
            </div>
          ) : (
            filtered.map((r, i) => {
              const path = pathBySlug.get(r.slug);
              const totalSteps = path?.total_steps ?? 0;
              const readPct = totalSteps > 0 ? Math.round((r.completed_count / totalSteps) * 100) : 0;
              return (
                <div
                  key={r.email + r.slug + i}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(220px, 2fr) minmax(180px, 2fr) 140px 140px 110px 110px",
                    gap: 12,
                    padding: "12px 16px",
                    alignItems: "center",
                    borderBottom: "1px solid var(--ll-border)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--ll-ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.email}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
                      bắt đầu {formatDate(r.started_at)}
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        color: "var(--ll-ink)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={r.slug}
                    >
                      {path?.title ?? r.slug}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ll-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      {r.slug}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, marginBottom: 4 }}>
                      {r.completed_count}/{totalSteps} · {readPct}%
                    </div>
                    <div className="ll-bar" style={{ height: 6 }}>
                      <span style={{ width: `${readPct}%` }} />
                    </div>
                  </div>
                  <div>
                    {r.quiz_best !== null ? (
                      <span
                        style={{
                          fontWeight: 600,
                          color:
                            r.quiz_best >= 0.8
                              ? "var(--ll-green-bright)"
                              : "#c07600",
                        }}
                      >
                        {Math.round(r.quiz_best * 100)}%
                      </span>
                    ) : (
                      <span style={{ color: "var(--ll-muted)", fontSize: 12 }}>
                        chưa làm
                      </span>
                    )}
                    {r.quiz_attempts > 0 && (
                      <div style={{ fontSize: 10, color: "var(--ll-muted)" }}>
                        {r.quiz_attempts} lần
                      </div>
                    )}
                  </div>
                  <div>
                    {r.quiz_passed ? (
                      <span
                        className="ll-badge"
                        style={{
                          background: "var(--ll-green-bright)",
                          color: "white",
                          fontSize: 10,
                        }}
                      >
                        PASSED
                      </span>
                    ) : r.quiz_attempts > 0 ? (
                      <span
                        className="ll-badge"
                        style={{
                          background: "#fef3c7",
                          color: "#c07600",
                          fontSize: 10,
                        }}
                      >
                        ĐANG HỌC
                      </span>
                    ) : (
                      <span
                        className="ll-badge"
                        style={{
                          background: "#e5e7eb",
                          color: "#6b7280",
                          fontSize: 10,
                        }}
                      >
                        CHƯA THI
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
                    {formatRelative(r.updated_at)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "default" | "green" | "orange" | "blue";
}) {
  const colors: Record<string, string> = {
    default: "var(--ll-ink)",
    green: "var(--ll-green-dark)",
    orange: "#c07600",
    blue: "#1e40af",
  };
  const bg: Record<string, string> = {
    default: "white",
    green: "var(--ll-green-soft)",
    orange: "var(--ll-orange-soft)",
    blue: "#dbeafe",
  };
  return (
    <div
      className="ll-anim-in"
      style={{
        padding: 16,
        borderRadius: "var(--ll-radius-md)",
        border: "1px solid var(--ll-border)",
        background: bg[accent],
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>{label}</div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: colors[accent],
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dy = Math.floor(h / 24);
  return `${dy}d`;
}

function toCSV(rows: ReportRow[], pathMap: Map<string, PathMeta>): string {
  const header = [
    "email",
    "path_slug",
    "path_title",
    "read_pct",
    "completed_steps",
    "total_steps",
    "quiz_best_pct",
    "quiz_passed",
    "quiz_attempts",
    "quiz_passed_at",
    "started_at",
    "updated_at",
  ];
  const escape = (s: string | number | null): string => {
    const str = s === null ? "" : String(s);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    const p = pathMap.get(r.slug);
    const total = p?.total_steps ?? 0;
    const readPct = total > 0 ? Math.round((r.completed_count / total) * 100) : 0;
    lines.push(
      [
        escape(r.email),
        escape(r.slug),
        escape(p?.title ?? ""),
        escape(readPct),
        escape(r.completed_count),
        escape(total),
        escape(r.quiz_best !== null ? Math.round(r.quiz_best * 100) : ""),
        escape(r.quiz_passed ? "yes" : "no"),
        escape(r.quiz_attempts),
        escape(r.quiz_passed_at),
        escape(r.started_at),
        escape(r.updated_at),
      ].join(",")
    );
  }
  return lines.join("\n");
}

const selStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  fontSize: 13,
  fontFamily: "inherit",
  background: "white",
  cursor: "pointer",
};
