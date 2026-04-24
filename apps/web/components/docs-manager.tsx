"use client";

import { useEffect, useMemo, useState } from "react";
import { DocsTree, type DocNode } from "@/components/docs-tree";
import { DocPane } from "@/components/doc-pane";
import { AuditLog } from "@/components/audit-log";

type RoleStr = "employee" | "lead" | "admin" | "host" | "lok" | "guest";

interface DocMeta {
  id: string;
  title: string;
  owner: string;
  audience: RoleStr[];
  sensitivity: "public" | "internal" | "restricted";
  tags: string[];
  last_reviewed: string;
  reviewer: string;
  status: "draft" | "approved" | "deprecated";
  path: string;
}

interface Props {
  canEdit: boolean;
}

export function DocsManager({ canEdit }: Props) {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    fetch("/api/admin/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  const navigate = (id: string | null) => {
    setSelectedRaw(id);
    setTreeOpen(false);
    if (!id) return;
    setHistory((h) => {
      const trimmed = h.slice(0, historyIndex + 1);
      if (trimmed[trimmed.length - 1] === id) return trimmed;
      const next = [...trimmed, id].slice(-50);
      setHistoryIndex(next.length - 1);
      return next;
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", id);
      url.searchParams.delete("path");
      window.history.pushState({ docId: id }, "", url.toString());
    }
  };

  const goBack = () => {
    if (historyIndex <= 0) return;
    const next = historyIndex - 1;
    setHistoryIndex(next);
    setSelectedRaw(history[next]);
  };
  const goForward = () => {
    if (historyIndex >= history.length - 1) return;
    const next = historyIndex + 1;
    setHistoryIndex(next);
    setSelectedRaw(history[next]);
  };
  const canBack = historyIndex > 0;
  const canForward = historyIndex < history.length - 1;

  useEffect(() => {
    if (!docs) return;
    if (typeof window === "undefined") return;
    const applyFromUrl = () => {
      const url = new URL(window.location.href);
      const byId = url.searchParams.get("doc");
      const byPath = url.searchParams.get("path");
      if (byId) {
        const found = docs.find((d) => d.id === byId);
        if (found) setSelectedRaw(found.id);
      } else if (byPath) {
        const found = docs.find((d) => d.path === byPath);
        if (found) setSelectedRaw(found.id);
      } else {
        setSelectedRaw(null);
      }
    };
    applyFromUrl();
    window.addEventListener("popstate", applyFromUrl);
    return () => window.removeEventListener("popstate", applyFromUrl);
  }, [docs]);

  const allTags = useMemo(() => {
    if (!docs) return [];
    const set = new Set<string>();
    for (const d of docs) for (const t of d.tags) set.add(t);
    return [...set].sort();
  }, [docs]);

  const treeDocs: DocNode[] = useMemo(() => {
    if (!docs) return [];
    let arr = docs;
    if (!showDeprecated) arr = arr.filter((d) => d.status !== "deprecated");
    return arr.map((d) => ({
      id: d.id,
      title: d.title,
      path: d.path,
      status: d.status,
      sensitivity: d.sensitivity,
      audience: d.audience,
      last_reviewed: d.last_reviewed,
    }));
  }, [docs, showDeprecated]);

  const stats = useMemo(() => {
    if (!docs) return null;
    const byZone: Record<string, number> = {
      internal: 0,
      host: 0,
      lok: 0,
      public: 0,
      inbox: 0,
    };
    let draft = 0;
    let restricted = 0;
    for (const d of docs) {
      const zone = zoneOf(d.path);
      byZone[zone] = (byZone[zone] ?? 0) + 1;
      if (d.status === "draft") draft++;
      if (d.sensitivity === "restricted") restricted++;
    }
    return { total: docs.length, byZone, draft, restricted };
  }, [docs]);

  return (
    <div
      className="ll-docs-shell"
      style={{
        display: "grid",
        gridTemplateColumns: "300px minmax(0, 1fr)",
        gap: 0,
        height: "calc(100vh - 180px)",
        minHeight: 560,
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-lg)",
        overflow: "hidden",
        background: "white",
        boxShadow: "var(--ll-shadow-md)",
        position: "relative",
      }}
    >
      {/* Mobile tree toggle — chỉ hiện <=768px */}
      <button
        type="button"
        className="ll-docs-tree-toggle"
        onClick={() => setTreeOpen(true)}
        aria-label="Mở cây tài liệu"
      >
        <span aria-hidden>☰</span>
        <span>Cây tài liệu</span>
      </button>

      {/* Backdrop mobile */}
      <div
        className={`ll-docs-tree-backdrop${treeOpen ? " is-open" : ""}`}
        onClick={() => setTreeOpen(false)}
      />

      {/* Left: tree */}
      <aside
        className={`ll-docs-tree${treeOpen ? " is-open" : ""}`}
        style={{
          borderRight: "1px solid var(--ll-border)",
          display: "flex",
          flexDirection: "column",
          background: "var(--ll-surface-soft)",
          minHeight: 0,
        }}
      >
        <header
          style={{
            padding: "14px 14px 10px",
            borderBottom: "1px solid var(--ll-border)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            flexShrink: 0,
            background: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <strong
              style={{
                fontSize: 13,
                color: "var(--ll-green-dark)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Knowledge tree
            </strong>
            {stats && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ll-muted)",
                  background: "var(--ll-surface-soft)",
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {stats.total} docs
              </span>
            )}
          </div>
          <input
            placeholder="Tìm tên / nội dung / path…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid var(--ll-border)",
              fontSize: 13,
              fontFamily: "inherit",
              width: "100%",
              background: "var(--ll-surface-soft)",
            }}
          />
          {stats && (
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                fontSize: 11,
                color: "var(--ll-muted)",
              }}
            >
              <StatChip
                count={stats.draft}
                label="draft"
                tone={stats.draft > 0 ? "orange" : "muted"}
              />
              <StatChip
                count={stats.restricted}
                label="restricted"
                tone={stats.restricted > 0 ? "red" : "muted"}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  cursor: "pointer",
                  marginLeft: "auto",
                }}
              >
                <input
                  type="checkbox"
                  checked={showDeprecated}
                  onChange={(e) => setShowDeprecated(e.target.checked)}
                />
                + deprecated
              </label>
            </div>
          )}
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {error ? (
            <div style={{ padding: 12, color: "#b91c1c", fontSize: 13 }}>
              Lỗi: {error}
            </div>
          ) : docs === null ? (
            <div
              style={{
                padding: 12,
                color: "var(--ll-muted)",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span className="ll-typing">
                <span />
                <span />
                <span />
              </span>
              Đang tải…
            </div>
          ) : (
            <DocsTree
              docs={treeDocs}
              selectedId={selected}
              onSelect={navigate}
              search={search}
            />
          )}
        </div>
      </aside>

      {/* Right: preview/edit pane */}
      <main style={{ minHeight: 0, overflow: "hidden" }}>
        {selected ? (
          <DocPane
            key={selected}
            id={selected}
            canEdit={canEdit}
            allTags={allTags}
            onOpenOther={(id) => navigate(id)}
            canBack={canBack}
            canForward={canForward}
            onBack={goBack}
            onForward={goForward}
            onSaved={(meta) => {
              setDocs(
                (list) =>
                  list?.map((d) => (d.id === meta.id ? meta : d)) ?? list,
              );
            }}
            onDeprecated={(meta) => {
              setDocs(
                (list) =>
                  list?.map((d) => (d.id === meta.id ? meta : d)) ?? list,
              );
            }}
          />
        ) : (
          <EmptyState stats={stats} onOpenTree={() => setTreeOpen(true)} />
        )}
      </main>
    </div>
  );
}

function StatChip({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "orange" | "red" | "muted";
}) {
  const fg = {
    orange: "#c07600",
    red: "#b91c1c",
    muted: "var(--ll-muted)",
  }[tone];
  const bg = {
    orange: "var(--ll-orange-soft)",
    red: "#fef2f2",
    muted: "transparent",
  }[tone];
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        color: fg,
        background: bg,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {count} {label}
    </span>
  );
}

function EmptyState({
  stats,
  onOpenTree,
}: {
  stats: {
    total: number;
    byZone: Record<string, number>;
    draft: number;
    restricted: number;
  } | null;
  onOpenTree: () => void;
}) {
  if (!stats) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          color: "var(--ll-muted)",
        }}
      >
        <span className="ll-typing">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "32px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        height: "100%",
        overflowY: "auto",
      }}
      className="ll-docs-empty"
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--ll-grad-calm)",
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            flexShrink: 0,
          }}
          aria-hidden
        >
          📚
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              color: "var(--ll-green-dark)",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            Kho tài liệu Local Life Asia
          </h2>
          <p
            style={{
              color: "var(--ll-muted)",
              fontSize: 13,
              margin: "4px 0 0",
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            Chọn tài liệu từ cây bên trái để xem hoặc sửa. Lưu xong tự ghi lại
            file Markdown — không cần commit tay.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTree}
          className="ll-mobile-only-inline"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid var(--ll-green)",
            background: "white",
            color: "var(--ll-green-dark)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ☰ Mở cây
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {Object.entries(stats.byZone)
          .filter(([, v]) => v > 0)
          .map(([zone, count]) => (
            <ZoneCard key={zone} zone={zone} count={count} />
          ))}
      </div>

      <section
        style={{
          padding: 16,
          background: "var(--ll-surface-soft)",
          border: "1px solid var(--ll-border)",
          borderRadius: "var(--ll-radius-md)",
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            color: "var(--ll-green-dark)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 700,
          }}
        >
          <span aria-hidden>🕐</span>
          Hoạt động gần đây
        </h3>
        <AuditLog compact limit={10} />
      </section>

      <section
        style={{
          padding: 16,
          background: "var(--ll-grad-calm)",
          border: "1px solid var(--ll-border)",
          borderRadius: "var(--ll-radius-md)",
        }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            color: "var(--ll-green-dark)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 700,
          }}
        >
          Mẹo dùng
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.8,
            color: "var(--ll-ink)",
          }}
        >
          <li>Gõ vào ô search sẽ auto-expand folder chứa kết quả.</li>
          <li>
            Icon file màu cam = <strong>draft</strong>, 🔒 = restricted.
          </li>
          <li>Click 1 file → preview bên phải; "Sửa" để edit inline.</li>
          <li>Admin có nút Deprecate ở footer file đang xem.</li>
        </ul>
      </section>
    </div>
  );
}

const ZONE_META: Record<
  string,
  { label: string; accent: string; emoji: string }
> = {
  internal: {
    label: "Nội bộ",
    accent: "var(--ll-zone-internal)",
    emoji: "🏢",
  },
  host: { label: "Host Portal", accent: "var(--ll-zone-host)", emoji: "🏡" },
  lok: { label: "LOK Portal", accent: "var(--ll-zone-lok)", emoji: "🎤" },
  public: { label: "Công khai", accent: "var(--ll-zone-public)", emoji: "🌐" },
  inbox: { label: "Inbox", accent: "var(--ll-orange)", emoji: "📥" },
};

function ZoneCard({ zone, count }: { zone: string; count: number }) {
  const meta = ZONE_META[zone] ?? {
    label: zone,
    accent: "var(--ll-muted)",
    emoji: "📄",
  };
  return (
    <div
      style={{
        padding: 14,
        background: "white",
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-md)",
        borderLeft: `4px solid ${meta.accent}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--ll-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontWeight: 600,
          }}
        >
          {meta.label}
        </span>
        <span style={{ fontSize: 18 }} aria-hidden>
          {meta.emoji}
        </span>
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: "var(--ll-ink)",
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>tài liệu</div>
    </div>
  );
}

function zoneOf(path: string): string {
  const p = path.split("/")[0];
  if (["internal", "host", "lok", "public"].includes(p)) return p;
  if (p === "inbox") return "inbox";
  return "internal";
}
