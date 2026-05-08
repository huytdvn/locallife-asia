"use client";

import { useEffect, useState } from "react";

type Operation = "update" | "create" | "fm_update" | "deprecate";

interface FmPatch {
  title?: string;
  tags?: string[];
  audience?: string[];
  sensitivity?: "public" | "internal" | "restricted";
  last_reviewed?: string;
  status?: "draft" | "approved" | "deprecated";
}

interface ProposedChange {
  key: string;
  operation: Operation;
  docId?: string;
  docTitle: string;
  docPath: string;
  newPath?: string;
  oldBody?: string;
  newBody?: string;
  fmPatch?: FmPatch;
  deprecateReason?: string;
  rationale: string;
  confidence: number;
}

interface ApplyResult {
  key: string;
  ok: boolean;
  error?: string;
}

type Step = "input" | "planning" | "review" | "applying" | "done";
type Mode = "commit" | "pr";

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

const SUGGESTIONS = [
  "Cập nhật chính sách hủy chuyến từ 24h thành 48h ở mọi nơi",
  "Đặt last_reviewed=hôm nay cho tất cả doc tag pricing",
  "Deprecate các doc onboarding cũ trước 2026 Q1",
  "Thêm thông tin về tuyến mới Đà Nẵng — Hội An vào doc liên quan",
];

export function CrossDocAiPanel({ open, onClose, onApplied }: Props) {
  const [step, setStep] = useState<Step>("input");
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [candidatesCount, setCandidatesCount] = useState(0);
  const [mode, setMode] = useState<Mode>("commit");
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);

  useEffect(() => {
    if (!open) return;
    setStep("input");
    setInstruction("");
    setChanges([]);
    setSelected(new Set());
    setError(null);
    setApplyResults([]);
  }, [open]);

  if (!open) return null;

  async function runPlan() {
    if (instruction.trim().length < 8) {
      setError("Nhập rõ yêu cầu (≥ 8 ký tự)");
      return;
    }
    setError(null);
    setStep("planning");
    try {
      const res = await fetch("/api/admin/ai/cross-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setChanges(data.changes ?? []);
      setCandidatesCount(data.candidates_count ?? 0);
      // Default-select changes có confidence ≥ 4.
      const auto = new Set<string>(
        (data.changes ?? [])
          .filter((c: ProposedChange) => c.confidence >= 4)
          .map((c: ProposedChange) => c.key)
      );
      setSelected(auto);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("input");
    }
  }

  async function runApply() {
    const picked = changes.filter((c) => selected.has(c.key));
    if (picked.length === 0) {
      setError("Chưa chọn doc nào để áp");
      return;
    }
    setError(null);
    setStep("applying");
    try {
      const res = await fetch("/api/admin/ai/cross-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          instruction: instruction.trim(),
          mode,
          changes: picked,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setApplyResults(data.results ?? []);
      setStep("done");
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("review");
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(changes.map((c) => c.key)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI tổng thể"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== "applying") onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "var(--ll-radius-lg)",
          width: "min(960px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--ll-shadow-md)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--ll-border)",
            background: "var(--ll-grad-calm)",
          }}
        >
          <div style={{ fontSize: 20 }} aria-hidden>
            ✨
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ color: "var(--ll-green-dark)", fontSize: 15 }}>
              AI tổng thể — chỉnh sửa nhất quán cross-doc
            </strong>
            <div style={{ fontSize: 12, color: "var(--ll-muted)", marginTop: 2 }}>
              1 yêu cầu → AI lên plan trên toàn KB → bạn xem diff, tick, áp.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === "applying"}
            aria-label="Đóng"
            style={closeBtn}
          >
            ✕
          </button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {step === "input" && (
            <InputStep
              instruction={instruction}
              setInstruction={setInstruction}
              error={error}
              onRun={runPlan}
            />
          )}
          {step === "planning" && (
            <CenteredStatus
              icon="🧠"
              title="AI đang quét KB và lên plan…"
              detail="BM25 search → filter candidate → rewrite từng doc song song. Mất 10-30 giây."
            />
          )}
          {step === "review" && (
            <ReviewStep
              changes={changes}
              selected={selected}
              toggle={toggle}
              selectAll={selectAll}
              clearAll={clearAll}
              candidatesCount={candidatesCount}
              error={error}
            />
          )}
          {step === "applying" && (
            <CenteredStatus
              icon="⚙️"
              title="Đang áp dụng…"
              detail={`Mode: ${mode === "commit" ? "Direct commit + audit" : "Mở PR"}. Đừng đóng tab.`}
            />
          )}
          {step === "done" && (
            <DoneStep
              results={applyResults}
              changes={changes}
              mode={mode}
              instruction={instruction}
            />
          )}
        </div>

        {(step === "review" || step === "done") && (
          <footer
            style={{
              padding: "12px 18px",
              borderTop: "1px solid var(--ll-border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              background: "var(--ll-surface-soft)",
            }}
          >
            {step === "review" && (
              <>
                <ModeToggle mode={mode} setMode={setMode} />
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                  Đã chọn {selected.size}/{changes.length}
                </span>
                <button type="button" onClick={onClose} style={btnGhost}>
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={runApply}
                  disabled={selected.size === 0}
                  style={btnPrimary}
                >
                  {mode === "commit"
                    ? `Commit ${selected.size} doc`
                    : `Mở PR cho ${selected.size} doc`}
                </button>
              </>
            )}
            {step === "done" && (
              <>
                <div style={{ flex: 1 }} />
                <button type="button" onClick={onClose} style={btnPrimary}>
                  Đóng
                </button>
              </>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

function InputStep(props: {
  instruction: string;
  setInstruction: (s: string) => void;
  error: string | null;
  onRun: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--ll-ink)" }}>
        Yêu cầu (tiếng Việt, càng cụ thể càng tốt)
      </label>
      <textarea
        value={props.instruction}
        onChange={(e) => props.setInstruction(e.target.value)}
        placeholder="VD: Cập nhật chính sách hủy chuyến từ 24h sang 48h ở mọi tài liệu liên quan."
        rows={5}
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--ll-border)",
          borderRadius: 8,
          fontSize: 14,
          fontFamily: "inherit",
          lineHeight: 1.5,
          resize: "vertical",
          background: "white",
        }}
      />
      <div>
        <div style={{ fontSize: 11, color: "var(--ll-muted)", marginBottom: 6 }}>
          Gợi ý nhanh:
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => props.setInstruction(s)}
              style={chipBtn}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {props.error && (
        <div
          style={{
            padding: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {props.error}
        </div>
      )}
      <div
        style={{
          background: "var(--ll-surface-soft)",
          padding: 12,
          borderRadius: 8,
          fontSize: 12,
          color: "var(--ll-muted)",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--ll-ink)" }}>AI có thể:</strong> sửa nội dung
        body, đổi front-matter (tags / audience / last_reviewed), tạo doc mới khi
        thông tin chưa có, mark deprecated. Mọi thay đổi đều qua git → audit log →
        sync KB. Bạn duyệt từng doc trước khi áp.
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={props.onRun} style={btnPrimary}>
          Lên plan
        </button>
      </div>
    </div>
  );
}

function CenteredStatus(props: { icon: string; title: string; detail: string }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        padding: "48px 16px",
        gap: 8,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 36 }} aria-hidden>
        {props.icon}
      </div>
      <strong style={{ color: "var(--ll-green-dark)", fontSize: 15 }}>
        {props.title}
      </strong>
      <span style={{ fontSize: 12, color: "var(--ll-muted)", maxWidth: 420 }}>
        {props.detail}
      </span>
      <span className="ll-typing" style={{ marginTop: 6 }}>
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

function ReviewStep(props: {
  changes: ProposedChange[];
  selected: Set<string>;
  toggle: (k: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  candidatesCount: number;
  error: string | null;
}) {
  if (props.changes.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: "center",
          color: "var(--ll-muted)",
          fontSize: 13,
        }}
      >
        AI quét {props.candidatesCount} doc nhưng không thấy doc nào cần đụng cho
        yêu cầu này. Thử rephrase cụ thể hơn?
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
          AI quét {props.candidatesCount} candidate, đề xuất {props.changes.length}{" "}
          thay đổi.
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={props.selectAll} style={chipBtn}>
          Chọn hết
        </button>
        <button type="button" onClick={props.clearAll} style={chipBtn}>
          Bỏ hết
        </button>
      </div>
      {props.error && (
        <div
          style={{
            padding: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#b91c1c",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {props.error}
        </div>
      )}
      {props.changes.map((c) => (
        <ChangeCard
          key={c.key}
          change={c}
          checked={props.selected.has(c.key)}
          onToggle={() => props.toggle(c.key)}
        />
      ))}
    </div>
  );
}

function ChangeCard(props: {
  change: ProposedChange;
  checked: boolean;
  onToggle: () => void;
}) {
  const { change } = props;
  const opMeta = OP_META[change.operation];
  return (
    <div
      style={{
        border: `1px solid ${props.checked ? "var(--ll-green)" : "var(--ll-border)"}`,
        borderRadius: 10,
        background: props.checked ? "var(--ll-grad-calm)" : "white",
        padding: 12,
        transition: "border-color 0.15s",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={props.checked}
          onChange={props.onToggle}
          style={{ marginTop: 4 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                ...opPill,
                background: opMeta.bg,
                color: opMeta.fg,
              }}
            >
              {opMeta.label}
            </span>
            <strong style={{ fontSize: 14, color: "var(--ll-ink)" }}>
              {change.docTitle}
            </strong>
            <span style={{ fontSize: 11, color: "var(--ll-muted)" }}>
              {change.newPath ?? change.docPath}
            </span>
            <span style={{ flex: 1 }} />
            <ConfidenceDots value={change.confidence} />
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--ll-muted)",
              marginTop: 6,
              fontStyle: "italic",
            }}
          >
            {change.rationale}
          </div>
        </div>
      </label>
      {(change.operation === "update" || change.operation === "create") && (
        <DiffPreview
          oldBody={change.oldBody ?? ""}
          newBody={change.newBody ?? ""}
        />
      )}
      {change.operation === "fm_update" && change.fmPatch && (
        <FmPatchPreview patch={change.fmPatch} />
      )}
      {change.operation === "deprecate" && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 6,
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          Sẽ mark <code>status: deprecated</code> + thêm note: "
          {change.deprecateReason ?? change.rationale}"
        </div>
      )}
    </div>
  );
}

function DiffPreview({ oldBody, newBody }: { oldBody: string; newBody: string }) {
  const [open, setOpen] = useState(false);
  const oldLines = oldBody.split("\n");
  const newLines = newBody.split("\n");
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...chipBtn,
          fontSize: 11,
          padding: "4px 10px",
        }}
      >
        {open ? "Ẩn" : "Xem"} diff — {oldCount} → {newCount} dòng
        {oldBody === "" ? " (doc mới)" : ""}
      </button>
      {open && (
        <div
          className={oldBody ? "ll-diff-pair" : ""}
          style={{
            display: "grid",
            gridTemplateColumns: oldBody ? "1fr 1fr" : "1fr",
            gap: 8,
            marginTop: 8,
            border: "1px solid var(--ll-border)",
            borderRadius: 6,
            overflow: "hidden",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {oldBody && (
            <pre style={diffPane(false)}>
              <code>{truncate(oldBody, 4000)}</code>
            </pre>
          )}
          <pre style={diffPane(true)}>
            <code>{truncate(newBody, 4000)}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function FmPatchPreview({ patch }: { patch: FmPatch }) {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        marginTop: 10,
        padding: 8,
        background: "var(--ll-surface-soft)",
        borderRadius: 6,
        fontSize: 12,
        fontFamily: "ui-monospace, monospace",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--ll-muted)" }}>
        FM patch:
      </div>
      {entries.map(([k, v]) => (
        <div key={k}>
          <span style={{ color: "var(--ll-green-dark)" }}>{k}</span>:{" "}
          {Array.isArray(v) ? v.join(", ") : String(v)}
        </div>
      ))}
    </div>
  );
}

function ConfidenceDots({ value }: { value: number }) {
  return (
    <span
      title={`Confidence ${value}/5`}
      style={{ fontSize: 11, color: "var(--ll-muted)", letterSpacing: 1 }}
    >
      {"●".repeat(value)}
      <span style={{ color: "var(--ll-border)" }}>{"●".repeat(5 - value)}</span>
    </span>
  );
}

function ModeToggle(props: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Apply mode"
      style={{
        display: "inline-flex",
        border: "1px solid var(--ll-border)",
        borderRadius: 999,
        padding: 2,
        background: "white",
      }}
    >
      <ModeBtn
        active={props.mode === "commit"}
        onClick={() => props.setMode("commit")}
        label="⚡ Commit ngay"
        title="Direct commit vào main + audit log"
      />
      <ModeBtn
        active={props.mode === "pr"}
        onClick={() => props.setMode("pr")}
        label="📝 Mở PR"
        title="Tạo branch + PR draft, review trên GitHub trước khi merge"
      />
    </div>
  );
}

function ModeBtn(props: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      role="radio"
      aria-checked={props.active}
      style={{
        padding: "5px 12px",
        border: "none",
        borderRadius: 999,
        background: props.active ? "var(--ll-green)" : "transparent",
        color: props.active ? "white" : "var(--ll-muted)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}

function DoneStep(props: {
  results: ApplyResult[];
  changes: ProposedChange[];
  mode: Mode;
  instruction: string;
}) {
  const ok = props.results.filter((r) => r.ok).length;
  const fail = props.results.filter((r) => !r.ok);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          padding: 14,
          borderRadius: 8,
          background:
            fail.length === 0
              ? "var(--ll-grad-calm)"
              : "#fffbeb",
          border: `1px solid ${fail.length === 0 ? "var(--ll-green)" : "#fbbf24"}`,
        }}
      >
        <strong style={{ color: "var(--ll-green-dark)", fontSize: 14 }}>
          {fail.length === 0 ? "✅ Hoàn tất" : "⚠️ Có lỗi từng phần"}
        </strong>
        <div style={{ fontSize: 13, marginTop: 4, color: "var(--ll-ink)" }}>
          {ok} doc {props.mode === "commit" ? "đã commit" : "đã có PR"} thành công
          {fail.length > 0 ? `, ${fail.length} doc lỗi` : ""}.
        </div>
      </div>
      {fail.length > 0 && (
        <div
          style={{
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: 10,
            background: "#fef2f2",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#991b1b" }}>
            Lỗi:
          </div>
          {fail.map((r) => {
            const c = props.changes.find((x) => x.key === r.key);
            return (
              <div key={r.key} style={{ marginBottom: 4 }}>
                <strong>{c?.docTitle ?? r.key}</strong>: {r.error}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
        Audit log đã ghi với batch_id riêng — vào /admin/audit để xem hoặc revert
        từng doc nếu cần.
      </div>
    </div>
  );
}

const OP_META: Record<
  Operation,
  { label: string; bg: string; fg: string }
> = {
  update: { label: "UPDATE BODY", bg: "#dbeafe", fg: "#1e40af" },
  create: { label: "CREATE NEW", bg: "#dcfce7", fg: "#166534" },
  fm_update: { label: "FM ONLY", bg: "#fef3c7", fg: "#92400e" },
  deprecate: { label: "DEPRECATE", bg: "#fee2e2", fg: "#991b1b" },
};

const opPill: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const closeBtn: React.CSSProperties = {
  padding: 6,
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 16,
  color: "var(--ll-muted)",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "var(--ll-green)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  background: "white",
  color: "var(--ll-ink)",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const chipBtn: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid var(--ll-border)",
  background: "white",
  fontSize: 12,
  cursor: "pointer",
  color: "var(--ll-ink)",
};

function diffPane(isNew: boolean): React.CSSProperties {
  return {
    margin: 0,
    padding: 10,
    background: isNew ? "#f0fdf4" : "#fef2f2",
    color: "var(--ll-ink)",
    overflowX: "auto",
    maxHeight: 360,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + "\n\n…[truncated " + (s.length - n) + " ký tự]";
}
