"use client";

import { useEffect, useState } from "react";
import { AiAssistPanel } from "@/components/ai-assist-panel";
import { MdRenderer } from "@/components/md-renderer";
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

interface FullDoc {
  meta: DocMeta;
  body: string;
}

interface Props {
  id: string;
  canEdit: boolean;
  allTags: string[];
  onSaved: (meta: DocMeta) => void;
  onDeprecated: (meta: DocMeta) => void;
  onOpenOther?: (id: string) => void;
  canBack?: boolean;
  canForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
}

const ALL_ROLES: RoleStr[] = [
  "employee",
  "lead",
  "admin",
  "host",
  "lok",
  "guest",
];

export function DocPane({
  id,
  canEdit,
  allTags,
  onSaved,
  onDeprecated,
  onOpenOther,
  canBack = false,
  canForward = false,
  onBack,
  onForward,
}: Props) {
  const [aiOpen, setAiOpen] = useState(false);

  // Keyboard shortcuts: Alt+← = back, Alt+→ = forward
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" && canBack && onBack) {
        e.preventDefault();
        onBack();
      } else if (e.key === "ArrowRight" && canForward && onForward) {
        e.preventDefault();
        onForward();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canBack, canForward, onBack, onForward]);
  const [doc, setDoc] = useState<FullDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"preview" | "edit">("preview");

  // Controlled form state; initialized when doc loads.
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [audience, setAudience] = useState<Set<string>>(new Set());
  const [sensitivity, setSensitivity] = useState<
    "public" | "internal" | "restricted"
  >("internal");
  const [status, setStatus] = useState<"draft" | "approved" | "deprecated">(
    "draft"
  );
  const [tags, setTags] = useState("");
  const [lastReviewed, setLastReviewed] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    setMode("preview");
    fetch(`/api/admin/docs/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: FullDoc | { error: string }) => {
        if (cancelled) return;
        if ("error" in d) {
          setError(d.error);
          return;
        }
        setDoc(d);
        setTitle(d.meta.title);
        setOwner(d.meta.owner);
        setReviewer(d.meta.reviewer);
        setAudience(new Set(d.meta.audience));
        setSensitivity(d.meta.sensitivity);
        setStatus(d.meta.status);
        setTags(d.meta.tags.join(", "));
        setLastReviewed(d.meta.last_reviewed);
        setBody(d.body);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  function toggleAudience(a: string) {
    const next = new Set(audience);
    if (next.has(a)) next.delete(a);
    else next.add(a);
    setAudience(next);
  }

  async function save() {
    if (!doc) return;
    setSaving(true);
    setError(null);
    const fm = {
      title: title.trim(),
      owner: owner.trim(),
      audience: [...audience] as RoleStr[],
      sensitivity,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      last_reviewed: lastReviewed,
      reviewer: reviewer.trim() || owner.trim(),
      status,
    };
    try {
      const res = await fetch(`/api/admin/docs/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fm, body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onSaved(data.meta);
      setDoc({ meta: data.meta, body });
      setMode("preview");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function deprecate() {
    if (!doc) return;
    const reason = window.prompt(
      "Tại sao deprecate? (sẽ ghi vào body + audit log)"
    );
    if (!reason) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/docs/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      onDeprecated(data.meta);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!doc) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100%",
          color: "var(--ll-muted)",
        }}
      >
        {error ? `Lỗi: ${error}` : "Đang tải..."}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "white",
      }}
    >
      <header
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid var(--ll-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          background: "var(--ll-surface-soft)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onBack}
            disabled={!canBack}
            title="Quay lại tài liệu trước (Alt+←)"
            aria-label="Back"
            style={navBtnStyle(canBack)}
          >
            ←
          </button>
          <button
            type="button"
            onClick={onForward}
            disabled={!canForward}
            title="Tiến tới tài liệu tiếp (Alt+→)"
            aria-label="Forward"
            style={navBtnStyle(canForward)}
          >
            →
          </button>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 2,
            }}
          >
            <span
              className="ll-badge"
              style={{
                background: `var(--ll-zone-${zoneOf(doc.meta.path)})`,
                color: "white",
                fontSize: 10,
              }}
            >
              {zoneOf(doc.meta.path)}
            </span>
            {doc.meta.sensitivity === "restricted" && (
              <span
                className="ll-badge"
                style={{
                  background: "var(--ll-sens-restricted)",
                  fontSize: 10,
                }}
              >
                restricted
              </span>
            )}
            {doc.meta.status !== "approved" && (
              <span
                className="ll-badge"
                style={{
                  background:
                    doc.meta.status === "draft"
                      ? "var(--ll-orange-soft)"
                      : "#f3f4f6",
                  color:
                    doc.meta.status === "draft" ? "#c07600" : "#6b7280",
                  fontSize: 10,
                }}
              >
                {doc.meta.status}
              </span>
            )}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 17,
              color: "var(--ll-green-dark)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {doc.meta.title}
          </h2>
          <div
            style={{
              fontSize: 11,
              color: "var(--ll-muted)",
              fontFamily: "monospace",
            }}
          >
            {doc.meta.path}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAiOpen(!aiOpen)}
            style={{
              ...btnGhostStyle,
              background: aiOpen ? "var(--ll-green-soft)" : "white",
              color: aiOpen ? "var(--ll-green-dark)" : "var(--ll-muted)",
              borderColor: aiOpen ? "var(--ll-green)" : "var(--ll-border)",
            }}
            title="Bật/tắt trợ lý AI"
          >
            {aiOpen ? "✕ AI" : "✦ AI"}
          </button>
          {mode === "preview" && canEdit && (
            <button
              type="button"
              onClick={() => setMode("edit")}
              style={btnPrimaryStyle}
            >
              Sửa
            </button>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={() => setMode("preview")}
                style={btnGhostStyle}
                disabled={saving}
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !canEdit}
                style={btnPrimaryStyle}
              >
                {saving ? "Đang lưu…" : "Lưu"}
              </button>
            </>
          )}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {error && (
            <div
              style={{
                padding: "10px 12px",
                background: "#fef2f2",
                color: "#b91c1c",
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {mode === "preview" ? (
            <PreviewPane doc={doc} />
          ) : (
            <EditPane
              title={title}
              setTitle={setTitle}
              owner={owner}
              setOwner={setOwner}
              reviewer={reviewer}
              setReviewer={setReviewer}
              audience={audience}
              toggleAudience={toggleAudience}
              sensitivity={sensitivity}
              setSensitivity={setSensitivity}
              status={status}
              setStatus={setStatus}
              tags={tags}
              setTags={setTags}
              allTags={allTags}
              lastReviewed={lastReviewed}
              setLastReviewed={setLastReviewed}
              body={body}
              setBody={setBody}
              canEdit={canEdit}
            />
          )}
        </div>

        {aiOpen && (
          <AiAssistPanel
            docId={doc.meta.id}
            title={title}
            body={body}
            existingTags={tags.split(",").map((t) => t.trim()).filter(Boolean)}
            canEdit={canEdit && mode === "edit"}
            onApplyClassify={(c) => {
              setTitle(c.title);
              setAudience(new Set(c.audience));
              setSensitivity(c.sensitivity as typeof sensitivity);
              const mergedTags = Array.from(
                new Set([
                  ...tags.split(",").map((t) => t.trim()).filter(Boolean),
                  ...c.tags,
                ])
              );
              setTags(mergedTags.join(", "));
              setMode("edit");
            }}
            onApplyTags={(newTags) => {
              const merged = Array.from(
                new Set([
                  ...tags.split(",").map((t) => t.trim()).filter(Boolean),
                  ...newTags,
                ])
              );
              setTags(merged.join(", "));
              setMode("edit");
            }}
            onApplyBody={(newBody) => {
              setBody(newBody);
              setMode("edit");
            }}
            onApplySummaryIntro={(summary) => {
              setBody(`> ${summary}\n\n${body}`);
              setMode("edit");
            }}
            onOpenSimilar={(otherId) => {
              if (onOpenOther) onOpenOther(otherId);
            }}
          />
        )}
      </div>

      {mode === "preview" && canEdit && (
        <footer
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--ll-border)",
            background: "var(--ll-surface-soft)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 12,
            color: "var(--ll-muted)",
            flexShrink: 0,
            maxHeight: "40%",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>
              Owner: <strong>{doc.meta.owner}</strong> · Review lần cuối:{" "}
              <strong>{doc.meta.last_reviewed}</strong>
            </span>
            <button
              type="button"
              onClick={deprecate}
              disabled={saving || doc.meta.status === "deprecated"}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid #fca5a5",
                background: "transparent",
                color: "#b91c1c",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Deprecate (soft)
            </button>
          </div>
          <details style={{ fontSize: 12 }}>
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                color: "var(--ll-green-dark)",
                padding: "4px 0",
              }}
            >
              🕐 Lịch sử cập nhật của tài liệu này
            </summary>
            <div style={{ marginTop: 8 }}>
              <AuditLog docId={doc.meta.id} compact limit={10} />
            </div>
          </details>
        </footer>
      )}
    </div>
  );
}

function PreviewPane({ doc }: { doc: FullDoc }) {
  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {doc.meta.audience.map((a) => (
          <span
            key={a}
            className="ll-badge"
            style={{
              background: `var(--ll-role-${a})`,
              color: "#111",
              fontSize: 10,
            }}
          >
            {a}
          </span>
        ))}
        {doc.meta.tags.map((t) => (
          <span
            key={t}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: "var(--ll-surface-soft)",
              border: "1px solid var(--ll-border)",
              color: "var(--ll-muted)",
              fontSize: 11,
              fontFamily: "ui-monospace, monospace",
            }}
          >
            #{t}
          </span>
        ))}
      </div>
      <MdRenderer>{doc.body}</MdRenderer>
    </>
  );
}

function EditPane(props: {
  title: string;
  setTitle: (v: string) => void;
  owner: string;
  setOwner: (v: string) => void;
  reviewer: string;
  setReviewer: (v: string) => void;
  audience: Set<string>;
  toggleAudience: (a: string) => void;
  sensitivity: "public" | "internal" | "restricted";
  setSensitivity: (v: "public" | "internal" | "restricted") => void;
  status: "draft" | "approved" | "deprecated";
  setStatus: (v: "draft" | "approved" | "deprecated") => void;
  tags: string;
  setTags: (v: string) => void;
  allTags: string[];
  lastReviewed: string;
  setLastReviewed: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  canEdit: boolean;
}) {
  const {
    title,
    setTitle,
    owner,
    setOwner,
    reviewer,
    setReviewer,
    audience,
    toggleAudience,
    sensitivity,
    setSensitivity,
    status,
    setStatus,
    tags,
    setTags,
    allTags,
    lastReviewed,
    setLastReviewed,
    body,
    setBody,
    canEdit,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
        }}
      >
        <Field label="Tiêu đề" full>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            style={inputStyle}
          />
        </Field>
        <Field label="Owner email">
          <input
            type="email"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            disabled={!canEdit}
            style={inputStyle}
          />
        </Field>
        <Field label="Reviewer">
          <input
            type="email"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            disabled={!canEdit}
            style={inputStyle}
          />
        </Field>
        <Field label="Sensitivity">
          <select
            value={sensitivity}
            onChange={(e) =>
              setSensitivity(e.target.value as typeof sensitivity)
            }
            disabled={!canEdit}
            style={inputStyle}
          >
            <option value="public">Công khai</option>
            <option value="internal">Nội bộ</option>
            <option value="restricted">Hạn chế</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            disabled={!canEdit}
            style={inputStyle}
          >
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </Field>
        <Field label="Ngày review">
          <input
            type="date"
            value={lastReviewed}
            onChange={(e) => setLastReviewed(e.target.value)}
            disabled={!canEdit}
            style={inputStyle}
          />
        </Field>
        <Field label="Audience" full>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALL_ROLES.map((a) => {
              const on = audience.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleAudience(a)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 999,
                    border: `1px solid ${
                      on ? "var(--ll-green)" : "var(--ll-border)"
                    }`,
                    background: on ? `var(--ll-role-${a})` : "white",
                    color: "#111",
                    fontSize: 12,
                    fontWeight: on ? 600 : 400,
                    cursor: canEdit ? "pointer" : "not-allowed",
                    textTransform: "capitalize",
                  }}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Tags (cách nhau dấu phẩy · autocomplete)" full>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            disabled={!canEdit}
            list="all-tags"
            style={inputStyle}
          />
          <datalist id="all-tags">
            {allTags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label
          style={{ fontSize: 12, color: "var(--ll-muted)", fontWeight: 500 }}
        >
          Nội dung (markdown)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={!canEdit}
          rows={20}
          style={{
            padding: 14,
            border: "1px solid var(--ll-border)",
            borderRadius: 10,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
            minHeight: 320,
            background: canEdit ? "white" : "var(--ll-surface-soft)",
            width: "100%",
          }}
        />
      </section>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <span style={{ fontSize: 12, color: "var(--ll-muted)", fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function zoneOf(path: string): string {
  const p = path.split("/")[0];
  if (["internal", "host", "lok", "public"].includes(p)) return p;
  return "internal";
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "white",
  width: "100%",
};
const btnPrimaryStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--ll-green)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhostStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  background: "white",
  fontSize: 13,
  cursor: "pointer",
};

function navBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "1px solid var(--ll-border)",
    background: enabled ? "white" : "transparent",
    color: enabled ? "var(--ll-green-dark)" : "var(--ll-border)",
    cursor: enabled ? "pointer" : "not-allowed",
    fontSize: 16,
    fontWeight: 600,
    display: "grid",
    placeItems: "center",
    transition: "all 120ms var(--ll-ease)",
  };
}
