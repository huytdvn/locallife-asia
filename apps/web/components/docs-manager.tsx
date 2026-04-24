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
  const [treeOpen, setTreeOpen] = useState(false); // mobile drawer
  // Navigation history (undo/redo giữa các doc đã chọn)
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    fetch("/api/admin/docs")
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .catch((e) => setError(String(e)));
  }, []);

  // Khi user chọn doc: push vào history (xoá phần forward nếu đang ở giữa)
  const navigate = (id: string | null) => {
    setSelectedRaw(id);
    setTreeOpen(false); // mobile: đóng drawer sau khi chọn
    if (!id) return;
    setHistory((h) => {
      const trimmed = h.slice(0, historyIndex + 1);
      if (trimmed[trimmed.length - 1] === id) return trimmed; // dedup liên tiếp
      const next = [...trimmed, id].slice(-50); // max 50
      setHistoryIndex(next.length - 1);
      return next;
    });
    // Sync URL để browser back/forward + share link hoạt động
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

  // Handle ?doc=<id> or ?path=<path> query param to open directly + lắng nghe popstate
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
    const byZone: Record<string, number> = { internal: 0, host: 0, lok: 0, public: 0, inbox: 0 };
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
      className="ll-docs-split"
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: 0,
        height: "calc(100vh - 200px)",
        minHeight: 600,
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-lg)",
        overflow: "hidden",
        background: "white",
        boxShadow: "var(--ll-shadow-sm)",
        position: "relative",
      }}
    >
      {/* Mobile tree toggle */}
      <button
        type="button"
        className="ll-mobile-only"
        onClick={() => setTreeOpen(true)}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 30,
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid var(--ll-border)",
          background: "white",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          boxShadow: "var(--ll-shadow-sm)",
        }}
      >
        ☰ Cây tài liệu
      </button>
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
        <div
          style={{
            padding: "12px 12px 8px",
            borderBottom: "1px solid var(--ll-border)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <input
            placeholder="Tìm tài liệu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--ll-border)",
              fontSize: 13,
              fontFamily: "inherit",
              width: "100%",
              background: "white",
            }}
          />
          {stats && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                fontSize: 11,
                color: "var(--ll-muted)",
              }}
            >
              <span>{stats.total} docs</span>
              <span>·</span>
              <span style={{ color: "#c07600" }}>{stats.draft} draft</span>
              <span>·</span>
              <span style={{ color: "#b91c1c" }}>
                {stats.restricted} restricted
              </span>
            </div>
          )}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--ll-muted)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={showDeprecated}
              onChange={(e) => setShowDeprecated(e.target.checked)}
            />
            Hiện cả deprecated
          </label>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {error ? (
            <div
              style={{
                padding: 12,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
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
                  list?.map((d) => (d.id === meta.id ? meta : d)) ?? list
              );
            }}
            onDeprecated={(meta) => {
              setDocs(
                (list) =>
                  list?.map((d) => (d.id === meta.id ? meta : d)) ?? list
              );
            }}
          />
        ) : (
          <EmptyState stats={stats} />
        )}
      </main>
    </div>
  );
}

function EmptyState({
  stats,
}: {
  stats: { total: number; byZone: Record<string, number>; draft: number; restricted: number } | null;
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
        Đang tải…
      </div>
    );
  }
  return (
    <div
      style={{
        padding: 40,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        height: "100%",
        overflowY: "auto",
      }}
    >
      <header>
        <h2 style={{ margin: 0, color: "var(--ll-green-dark)", fontSize: 22 }}>
          Kho tài liệu nội bộ
        </h2>
        <p style={{ color: "var(--ll-muted)", fontSize: 14, marginTop: 4 }}>
          Chọn 1 tài liệu từ cây folder bên trái để xem / sửa. Lưu xong tự
          ghi lại file <code>.md</code>.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
        }}
      >
        {Object.entries(stats.byZone)
          .filter(([, v]) => v > 0)
          .map(([zone, count]) => (
            <div
              key={zone}
              className="ll-card"
              style={{
                padding: 16,
                borderLeft: `4px solid var(--ll-zone-${zone}, var(--ll-orange))`,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ll-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 600,
                }}
              >
                {ZONE_LABEL[zone] ?? zone}
              </div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "var(--ll-ink)",
                  lineHeight: 1,
                  marginTop: 4,
                }}
              >
                {count}
              </div>
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                tài liệu
              </div>
            </div>
          ))}
      </div>

      <section className="ll-card">
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: 14,
            color: "var(--ll-green-dark)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          🕐 Hoạt động gần đây trong KB
        </h3>
        <AuditLog compact limit={12} />
      </section>

      <section
        className="ll-card"
        style={{ background: "var(--ll-grad-calm)" }}
      >
        <h3
          style={{
            margin: "0 0 8px",
            fontSize: 13,
            color: "var(--ll-green-dark)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Mẹo dùng tree
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          <li>Click chevron ▶ để mở/đóng folder</li>
          <li>
            Gõ vào ô search sẽ auto-expand folder chứa kết quả
          </li>
          <li>
            Icon file màu cam = <strong>draft</strong>, 🔒 = restricted
          </li>
          <li>Click 1 file → preview bên phải; click "Sửa" để edit</li>
          <li>Admin có nút Deprecate ở footer file đang preview</li>
        </ul>
      </section>
    </div>
  );
}

const ZONE_LABEL: Record<string, string> = {
  internal: "Nội bộ",
  host: "Host Portal",
  lok: "LOK Portal",
  public: "Công khai",
  inbox: "Inbox (chưa classify)",
};

function zoneOf(path: string): string {
  const p = path.split("/")[0];
  if (["internal", "host", "lok", "public"].includes(p)) return p;
  if (p === "inbox") return "inbox";
  return "internal";
}
