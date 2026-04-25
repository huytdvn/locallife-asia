"use client";

import { Fragment, useMemo, useState } from "react";

type Mode = "classify-only" | "rewrite-and-move";

interface PlanItem {
  id: string;
  currentPath: string;
  currentTitle: string;
  newPath: string;
  newTitle: string;
  pathChanged: boolean;
  titleChanged: boolean;
  bodyChanged: boolean;
  currentBody?: string;
  newBody?: string;
  reasoning: string;
  confidence: number;
  skipped?: string;
}

interface Plan {
  items: PlanItem[];
  scanned: number;
  generatedAt: string;
  hasMore?: boolean;
  nextOffset?: number;
}

// Rewrite mode takes ~10s/doc via Gemini; 30/page keeps each request well
// under the 800s route limit. Classify-only is fast enough we can skip
// paging by requesting the whole KB at once.
const REWRITE_PAGE_SIZE = 30;

interface ApplyResult {
  copied: number;
  rewrote: number;
  titleUpdated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
  createdIds: string[];
}

export function ReorganizeButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("classify-only");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState<{ done: number } | null>(null);

  async function buildPlan() {
    setBusy(true);
    setError(null);
    setPlan(null);
    setResult(null);
    setProgress({ done: 0 });
    try {
      // Classify-only: single request (fast). Rewrite: chunked pagination.
      const pageSize =
        mode === "rewrite-and-move" ? REWRITE_PAGE_SIZE : undefined;

      const aggregated: PlanItem[] = [];
      let offset = 0;
      let totalScanned = 0;
      let hasMore = true;
      // Safety: cap iterations so a server bug that never advances offset
      // can't spin the client. 200 pages × 30/page = 6000 docs — well
      // above any plausible KB size.
      const MAX_ITER = 200;
      let iter = 0;

      while (hasMore && iter < MAX_ITER) {
        iter++;
        const prevOffset = offset;
        const res = await fetch("/api/admin/reorganize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "plan",
            mode,
            limit: pageSize,
            offset,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        aggregated.push(...(data.items ?? []));
        totalScanned += data.scanned ?? 0;
        setProgress({ done: totalScanned });
        hasMore = !!data.hasMore;
        offset = data.nextOffset ?? offset + (data.scanned ?? 0);
        if (!pageSize) break; // single-shot mode
        if (offset <= prevOffset) {
          setError("Server returned non-advancing offset — aborting");
          return;
        }
      }
      if (iter >= MAX_ITER) {
        setError("Pagination iteration cap reached — aborting");
        return;
      }

      setPlan({
        items: aggregated,
        scanned: totalScanned,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function applyPlan() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reorganize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "apply", plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      setPlan(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const changes = plan?.items.filter(
    (i) => !i.skipped && (i.pathChanged || i.titleChanged || i.bodyChanged),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          background: "var(--ll-green)",
          color: "white",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        ✨ Sắp xếp &amp; hệ thống lại
      </button>

      {open && (
        <Modal onClose={() => (busy ? null : setOpen(false))}>
          <h2
            style={{
              margin: 0,
              color: "var(--ll-green-dark)",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            Sắp xếp &amp; hệ thống lại toàn bộ KB
          </h2>
          <p style={{ fontSize: 13, color: "var(--ll-muted)", marginTop: 4 }}>
            AI sẽ đọc từng doc, gợi ý zone/dept + title chuẩn. Chế độ{" "}
            <strong>rewrite</strong> cũng chuẩn hoá văn phong. Plan sẽ hiện
            trước khi apply — bạn có thể huỷ.
          </p>

          {!plan && !result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <fieldset
                style={{
                  border: "1px solid var(--ll-border)",
                  borderRadius: 10,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <legend
                  style={{
                    padding: "0 6px",
                    fontSize: 12,
                    color: "var(--ll-muted)",
                    fontWeight: 600,
                  }}
                >
                  Chế độ
                </legend>
                <label style={optionRow}>
                  <input
                    type="radio"
                    checked={mode === "classify-only"}
                    onChange={() => setMode("classify-only")}
                  />
                  <div>
                    <strong>Chỉ sắp xếp lại (classify-only)</strong>
                    <div style={subtitleStyle}>
                      Nhanh (~2–3 phút / 100 doc). Chỉ đổi folder + tiêu đề
                      nếu AI confident ≥ 3/5. Body giữ nguyên.
                    </div>
                  </div>
                </label>
                <label style={optionRow}>
                  <input
                    type="radio"
                    checked={mode === "rewrite-and-move"}
                    onChange={() => setMode("rewrite-and-move")}
                  />
                  <div>
                    <strong>Rewrite + sắp xếp lại</strong>
                    <div style={subtitleStyle}>
                      Lâu (~10–15 phút). AI rewrite body theo văn phong doanh
                      nghiệp LLA (H2/bullet/rõ, giữ data), đồng thời classify.
                    </div>
                  </div>
                </label>
              </fieldset>
              <button
                type="button"
                onClick={buildPlan}
                disabled={busy}
                style={primaryBtn(busy)}
              >
                {busy
                  ? progress
                    ? `AI đang đọc KB… (${progress.done} docs scanned)`
                    : "AI đang đọc KB…"
                  : "Tạo plan"}
              </button>
            </div>
          )}

          {plan && (
            <PlanReview
              plan={plan}
              changes={changes ?? []}
              busy={busy}
              onCancel={() => setPlan(null)}
              onApply={applyPlan}
            />
          )}

          {result && <ResultView result={result} onClose={() => setResult(null)} />}

          {error && (
            <div
              style={{
                padding: 10,
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              style={secondaryBtn(busy)}
            >
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function PlanReview({
  plan,
  changes,
  busy,
  onCancel,
  onApply,
}: {
  plan: Plan;
  changes: PlanItem[];
  busy: boolean;
  onCancel: () => void;
  onApply: () => void;
}) {
  const lowConf = changes.filter((c) => c.confidence <= 2);
  const skipped = plan.items.length - changes.length;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          background: "var(--ll-grad-calm)",
          padding: 10,
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <span>
          <strong>{plan.scanned}</strong> doc scanned
        </span>
        <span>·</span>
        <span>
          <strong>{changes.length}</strong> doc có thay đổi
        </span>
        <span>·</span>
        <span>{skipped} giữ nguyên</span>
        {lowConf.length > 0 && (
          <>
            <span>·</span>
            <span style={{ color: "var(--ll-orange)" }}>
              {lowConf.length} confidence thấp (≤2/5)
            </span>
          </>
        )}
      </div>

      <div
        style={{
          padding: "8px 10px",
          background: "var(--ll-green-soft)",
          border: "1px solid var(--ll-green-bright)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--ll-green-dark)",
          lineHeight: 1.5,
        }}
      >
        ℹ <strong>Non-destructive apply</strong>: file có path-change sẽ
        được <strong>copy</strong> sang path mới (ULID mới), bản gốc giữ
        nguyên. Review xong rồi deprecate bản thừa ở <code>/admin/docs</code>.
      </div>

      <div
        style={{
          maxHeight: 360,
          overflowY: "auto",
          border: "1px solid var(--ll-border)",
          borderRadius: 8,
          background: "white",
        }}
      >
        {changes.length === 0 ? (
          <div
            style={{ padding: 20, color: "var(--ll-muted)", fontSize: 13 }}
          >
            Không có thay đổi nào — KB đã sắp xếp tốt rồi.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                background: "var(--ll-surface-soft)",
                zIndex: 1,
              }}
            >
              <tr>
                <th style={thStyle}>File</th>
                <th style={thStyle}>→ Target</th>
                <th style={thStyle}>Đổi</th>
                <th style={thStyle}>Conf</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => {
                const isOpen = expanded.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <tr style={{ borderTop: "1px solid var(--ll-border)" }}>
                      <td style={tdStyle}>
                        <div
                          style={{
                            fontFamily: "monospace",
                            color: "var(--ll-muted)",
                            fontSize: 11,
                          }}
                        >
                          {c.currentPath}
                        </div>
                        <div style={{ color: "var(--ll-ink)" }}>
                          {c.currentTitle}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {c.pathChanged && (
                          <div
                            style={{
                              fontFamily: "monospace",
                              color: "var(--ll-green-dark)",
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {c.newPath}
                          </div>
                        )}
                        {c.titleChanged && (
                          <div style={{ color: "var(--ll-green-dark)" }}>
                            {c.newTitle}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {c.pathChanged && (
                          <span style={chip("green")}>copy</span>
                        )}{" "}
                        {c.titleChanged && (
                          <span style={chip("blue")}>title</span>
                        )}{" "}
                        {c.bodyChanged && (
                          <button
                            type="button"
                            onClick={() => toggle(c.id)}
                            style={{
                              ...chip("orange"),
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            rewrite {isOpen ? "▾" : "▸"}
                          </button>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              c.confidence >= 4
                                ? "var(--ll-green-dark)"
                                : c.confidence >= 3
                                  ? "var(--ll-orange)"
                                  : "#b91c1c",
                          }}
                        >
                          {c.confidence}/5
                        </span>
                      </td>
                    </tr>
                    {isOpen && c.bodyChanged && (
                      <tr style={{ background: "var(--ll-surface-soft)" }}>
                        <td colSpan={4} style={{ padding: 12 }}>
                          <BodyDiff
                            oldBody={c.currentBody ?? ""}
                            newBody={c.newBody ?? ""}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onApply}
          disabled={busy || changes.length === 0}
          style={primaryBtn(busy || changes.length === 0)}
        >
          {busy
            ? "Đang apply…"
            : `Copy ${changes.filter((c) => c.pathChanged).length} file + update ${changes.filter((c) => !c.pathChanged && (c.titleChanged || c.bodyChanged)).length} in-place`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={secondaryBtn(busy)}
        >
          Huỷ plan / tạo lại
        </button>
      </div>
    </div>
  );
}

function ResultView({
  result,
  onClose,
}: {
  result: ApplyResult;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--ll-green-soft)",
        border: "1px solid var(--ll-green)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <strong style={{ color: "var(--ll-green-dark)" }}>
        ✓ Đã apply xong (non-destructive)
      </strong>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
        <span>
          <strong>{result.copied}</strong> file copied
        </span>
        <span>
          <strong>{result.titleUpdated}</strong> title updated
        </span>
        <span>
          <strong>{result.rewrote}</strong> body rewritten
        </span>
        <span style={{ color: "var(--ll-muted)" }}>
          {result.skipped} skipped
        </span>
        {result.failed > 0 && (
          <span style={{ color: "#b91c1c" }}>{result.failed} failed</span>
        )}
      </div>
      {result.copied > 0 && (
        <div
          style={{
            padding: 10,
            background: "var(--ll-orange-soft)",
            border: "1px solid var(--ll-orange)",
            borderRadius: 8,
            fontSize: 12,
            color: "#c07600",
            lineHeight: 1.6,
          }}
        >
          <strong>{result.copied} bản gốc vẫn còn trên disk.</strong> Vào{" "}
          <a href="/admin/docs" style={{ color: "inherit", fontWeight: 600 }}>
            Quản lý tài liệu
          </a>{" "}
          để so sánh copy mới với bản cũ, xong rồi deprecate bản không dùng.
        </div>
      )}
      {result.errors.length > 0 && (
        <details
          style={{ fontSize: 12, color: "#b91c1c", fontFamily: "monospace" }}
        >
          <summary>Lỗi chi tiết ({result.errors.length})</summary>
          {result.errors.map((e, i) => (
            <div key={i}>
              {e.id}: {e.error}
            </div>
          ))}
        </details>
      )}
      <button
        type="button"
        onClick={onClose}
        style={{
          alignSelf: "flex-start",
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid var(--ll-green)",
          background: "white",
          color: "var(--ll-green-dark)",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Đóng
      </button>
    </div>
  );
}

/**
 * Naive line-level diff. Đủ để admin biết AI đã thêm/bớt gì — không cần
 * Myers's LCS cho MVP (và thêm dependency). Trim common prefix + suffix,
 * show phần middle như two-panel diff.
 */
function BodyDiff({
  oldBody,
  newBody,
}: {
  oldBody: string;
  newBody: string;
}) {
  const { removed, added, sameHead, sameTail } = useMemo(() => {
    const oldLines = oldBody.split("\n");
    const newLines = newBody.split("\n");
    let head = 0;
    while (
      head < oldLines.length &&
      head < newLines.length &&
      oldLines[head] === newLines[head]
    ) {
      head++;
    }
    let tail = 0;
    while (
      tail < oldLines.length - head &&
      tail < newLines.length - head &&
      oldLines[oldLines.length - 1 - tail] ===
        newLines[newLines.length - 1 - tail]
    ) {
      tail++;
    }
    const removed = oldLines.slice(head, oldLines.length - tail);
    const added = newLines.slice(head, newLines.length - tail);
    return { removed, added, sameHead: head, sameTail: tail };
  }, [oldBody, newBody]);

  const oldLen = oldBody.split("\n").length;
  const newLen = newBody.split("\n").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          fontSize: 11,
          color: "var(--ll-muted)",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <span>- {oldLen} dòng cũ</span>
        <span>+ {newLen} dòng mới</span>
        <span>
          · giữ nguyên {sameHead} dòng đầu, {sameTail} dòng cuối
        </span>
        <span style={{ color: "#b91c1c" }}>
          · bỏ {removed.length} dòng
        </span>
        <span style={{ color: "var(--ll-green-dark)" }}>
          · thêm {added.length} dòng
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <DiffPanel
          label="Bản cũ (khối thay đổi)"
          lines={removed}
          tone="remove"
        />
        <DiffPanel label="AI rewrite (khối mới)" lines={added} tone="add" />
      </div>
    </div>
  );
}

function DiffPanel({
  label,
  lines,
  tone,
}: {
  label: string;
  lines: string[];
  tone: "add" | "remove";
}) {
  const bg = tone === "add" ? "rgba(29, 155, 95, 0.08)" : "rgba(185, 28, 28, 0.06)";
  const border =
    tone === "add" ? "1px solid rgba(29, 155, 95, 0.3)" : "1px solid rgba(185, 28, 28, 0.3)";
  const prefix = tone === "add" ? "+" : "−";
  const prefixColor = tone === "add" ? "var(--ll-green-bright)" : "#b91c1c";
  return (
    <div
      style={{
        background: bg,
        border,
        borderRadius: 6,
        padding: 8,
        minHeight: 80,
        maxHeight: 260,
        overflow: "auto",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--ll-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {lines.length === 0 ? (
        <div style={{ color: "var(--ll-muted)", fontStyle: "italic" }}>
          (trống)
        </div>
      ) : (
        lines.map((l, i) => (
          <div
            key={i}
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            <span style={{ color: prefixColor, userSelect: "none" }}>
              {prefix}{" "}
            </span>
            {l || " "}
          </div>
        ))
      )}
    </div>
  );
}

function Modal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6,45,26,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: 14,
          padding: 24,
          maxWidth: 760,
          width: "100%",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          boxShadow: "var(--ll-shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const optionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  cursor: "pointer",
  fontSize: 13,
  color: "var(--ll-ink)",
};
const subtitleStyle: React.CSSProperties = {
  color: "var(--ll-muted)",
  fontSize: 12,
  marginTop: 2,
};
const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  fontWeight: 600,
  color: "var(--ll-muted)",
  borderBottom: "1px solid var(--ll-border)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  verticalAlign: "top",
};

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: "none",
    background: disabled ? "var(--ll-muted)" : "var(--ll-green)",
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: 13,
  };
}
function secondaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid var(--ll-border)",
    background: "white",
    color: "var(--ll-ink)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 500,
    fontSize: 13,
  };
}

function chip(tone: "green" | "blue" | "orange"): React.CSSProperties {
  const bg = {
    green: "var(--ll-green-soft)",
    blue: "#dbeafe",
    orange: "var(--ll-orange-soft)",
  }[tone];
  const fg = {
    green: "var(--ll-green-dark)",
    blue: "#1e40af",
    orange: "#c07600",
  }[tone];
  return {
    padding: "2px 8px",
    borderRadius: 999,
    background: bg,
    color: fg,
    fontSize: 11,
    fontWeight: 600,
  };
}
