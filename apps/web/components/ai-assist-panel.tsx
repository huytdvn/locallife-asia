"use client";

import { useState } from "react";

type ClassifyResult = {
  zone: string;
  dept: string;
  subfolder: string | null;
  title: string;
  tags: string[];
  audience: string[];
  sensitivity: string;
  reasoning: string;
  confidence: number;
};

type SimilarItem = {
  id: string;
  title: string;
  path: string;
  similarity: number;
  reason: string;
};

interface Props {
  docId: string;
  title: string;
  body: string;
  existingTags: string[];
  canEdit: boolean;
  onApplyClassify: (c: ClassifyResult) => void;
  onApplyTags: (tags: string[]) => void;
  onApplyBody: (body: string) => void;
  onApplySummaryIntro: (summary: string) => void;
  onOpenSimilar: (id: string) => void;
}

type Busy = "classify" | "improve" | "tags" | "summarize" | "similar" | null;

/**
 * Panel AI phụ trợ admin quản lý tài liệu.
 * Chạy ở cạnh preview/edit; 5 action chính.
 */
export function AiAssistPanel({
  docId,
  title,
  body,
  existingTags,
  canEdit,
  onApplyClassify,
  onApplyTags,
  onApplyBody,
  onApplySummaryIntro,
  onOpenSimilar,
}: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [cls, setCls] = useState<ClassifyResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[] | null>(null);
  const [similar, setSimilar] = useState<SimilarItem[] | null>(null);
  const [improveInstr, setImproveInstr] = useState("");
  const [improved, setImproved] = useState<string | null>(null);

  async function call(
    action: "classify" | "improve" | "tags" | "summarize" | "similar",
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: docId, title, body, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      return data;
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside
      style={{
        width: 320,
        borderLeft: "1px solid var(--ll-border)",
        background: "var(--ll-surface-soft)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--ll-border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--ll-grad-calm)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background:
              "linear-gradient(135deg, var(--ll-orange) 0%, var(--ll-green) 100%)",
            display: "grid",
            placeItems: "center",
            color: "white",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          AI
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ll-green-dark)",
            }}
          >
            Trợ lý AI
          </div>
          <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
            Gemini 2.5 Flash
          </div>
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {error && (
          <div
            style={{
              padding: "8px 10px",
              background: "#fef2f2",
              color: "#b91c1c",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {/* 1. Classify */}
        <Section title="Phân loại lại">
          <button
            type="button"
            style={aiBtnStyle(busy === "classify")}
            disabled={busy !== null}
            onClick={async () => {
              try {
                const d = (await call("classify", {})) as ClassifyResult;
                setCls(d);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {busy === "classify"
              ? "Đang phân tích…"
              : "Đề xuất zone / dept / audience"}
          </button>
          {cls && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 6,
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <Row k="Zone" v={`${cls.zone} / ${cls.dept}${cls.subfolder ? "/" + cls.subfolder : ""}`} />
              <Row k="Title gợi ý" v={cls.title} />
              <Row k="Audience" v={cls.audience.join(", ")} />
              <Row k="Sensitivity" v={cls.sensitivity} />
              <Row k="Tags" v={cls.tags.join(", ")} />
              <Row k="Confidence" v={`${cls.confidence}/5`} />
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ll-muted)",
                  fontStyle: "italic",
                  marginTop: 4,
                }}
              >
                {cls.reasoning}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onApplyClassify(cls)}
                  style={applyBtnStyle}
                >
                  Áp dụng toàn bộ vào form
                </button>
              )}
            </div>
          )}
        </Section>

        {/* 2. Suggest tags */}
        <Section title="Gợi ý tags">
          <button
            type="button"
            style={aiBtnStyle(busy === "tags")}
            disabled={busy !== null}
            onClick={async () => {
              try {
                const d = (await call("tags", { existing: existingTags })) as {
                  tags: string[];
                };
                setSuggestedTags(d.tags);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {busy === "tags" ? "Đang nghĩ…" : "Sinh tag từ nội dung"}
          </button>
          {suggestedTags && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 6,
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
              }}
            >
              {suggestedTags.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "var(--ll-green-soft)",
                    color: "var(--ll-green-dark)",
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                >
                  {t}
                </span>
              ))}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onApplyTags(suggestedTags)}
                  style={applyBtnStyle}
                >
                  Dùng tags này
                </button>
              )}
            </div>
          )}
        </Section>

        {/* 3. Summarize */}
        <Section title="Tóm tắt">
          <button
            type="button"
            style={aiBtnStyle(busy === "summarize")}
            disabled={busy !== null}
            onClick={async () => {
              try {
                const d = (await call("summarize", {})) as {
                  summary: string;
                };
                setSummary(d.summary);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {busy === "summarize" ? "Đang viết…" : "Sinh tóm tắt 2-3 câu"}
          </button>
          {summary && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 6,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--ll-ink)",
              }}
            >
              {summary}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onApplySummaryIntro(summary)}
                  style={{ ...applyBtnStyle, marginTop: 6 }}
                >
                  Chèn vào đầu body
                </button>
              )}
            </div>
          )}
        </Section>

        {/* 4. Improve body */}
        <Section title="Cải thiện nội dung">
          <textarea
            placeholder="Yêu cầu cụ thể (tuỳ chọn) — để trống = cải thiện chung"
            value={improveInstr}
            onChange={(e) => setImproveInstr(e.target.value)}
            rows={2}
            style={{
              width: "100%",
              padding: 8,
              borderRadius: 6,
              border: "1px solid var(--ll-border)",
              fontSize: 12,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <button
            type="button"
            style={{ ...aiBtnStyle(busy === "improve"), marginTop: 6 }}
            disabled={busy !== null}
            onClick={async () => {
              try {
                const d = (await call("improve", {
                  instruction: improveInstr,
                })) as { body: string };
                setImproved(d.body);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {busy === "improve"
              ? "Đang viết lại…"
              : "AI viết lại (giữ ý, tối ưu trình bày)"}
          </button>
          {improved && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 6,
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                maxHeight: 180,
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {improved.slice(0, 800)}
              {improved.length > 800 && "…"}
              {canEdit && (
                <div
                  style={{ marginTop: 8, display: "flex", gap: 6 }}
                >
                  <button
                    type="button"
                    onClick={() => onApplyBody(improved)}
                    style={applyBtnStyle}
                  >
                    Thay body bằng bản này
                  </button>
                  <button
                    type="button"
                    onClick={() => setImproved(null)}
                    style={{
                      ...applyBtnStyle,
                      background: "white",
                      color: "var(--ll-muted)",
                      border: "1px solid var(--ll-border)",
                    }}
                  >
                    Huỷ
                  </button>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* 5. Find similar */}
        <Section title="Tìm tài liệu tương tự">
          <button
            type="button"
            style={aiBtnStyle(busy === "similar")}
            disabled={busy !== null}
            onClick={async () => {
              try {
                const d = (await call("similar", {})) as {
                  similar: SimilarItem[];
                };
                setSimilar(d.similar);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            {busy === "similar"
              ? "Đang quét…"
              : "Quét overlap nội dung trong KB"}
          </button>
          {similar && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {similar.length === 0 ? (
                <div
                  style={{
                    padding: 8,
                    fontSize: 12,
                    color: "var(--ll-muted)",
                    fontStyle: "italic",
                  }}
                >
                  Không có doc nào tương tự. Tài liệu này độc nhất.
                </div>
              ) : (
                similar.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpenSimilar(s.id)}
                    style={{
                      padding: 10,
                      background: "white",
                      border: "1px solid var(--ll-border)",
                      borderRadius: 6,
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--ll-ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.title}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--ll-orange)",
                          fontWeight: 600,
                        }}
                      >
                        {Math.round(s.similarity * 100)}%
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--ll-muted)",
                        fontFamily: "monospace",
                      }}
                    >
                      {s.path}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--ll-muted)",
                        fontStyle: "italic",
                      }}
                    >
                      {s.reason}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </Section>
      </div>
    </aside>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        padding: 12,
        background: "white",
        borderRadius: 8,
        border: "1px solid var(--ll-border)",
      }}
    >
      <h4
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ll-green-dark)",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
        }}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
      <span
        style={{
          color: "var(--ll-muted)",
          minWidth: 90,
          fontWeight: 500,
        }}
      >
        {k}:
      </span>
      <span style={{ color: "var(--ll-ink)", wordBreak: "break-word" }}>
        {v}
      </span>
    </div>
  );
}

function aiBtnStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "none",
    background: loading ? "var(--ll-muted)" : "var(--ll-green)",
    color: "white",
    fontSize: 12,
    fontWeight: 600,
    cursor: loading ? "wait" : "pointer",
  };
}

const applyBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "none",
  background: "var(--ll-orange)",
  color: "white",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  marginTop: 6,
};
