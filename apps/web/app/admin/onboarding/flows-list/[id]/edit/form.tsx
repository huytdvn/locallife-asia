"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface DocRef {
  id: number;
  doc_path: string;
  heading_anchor: string | null;
  highlight: string | null;
  reason: string | null;
}
interface Question {
  id: number;
  prompt: string;
  expected_keywords: string[];
  min_keywords: number;
  choices: string[] | null;
  answer_idx: number | null;
  explanation: string | null;
}
interface Step {
  id: number;
  idx: number;
  goal: string;
  intro: string | null;
  pass_criteria: string | null;
  docs: DocRef[];
  questions: Question[];
}
interface FlowInitial {
  id: number;
  title: string;
  motto: string | null;
  brief: string | null;
  pass_threshold: number;
  steps: Step[];
}

export function FlowEditForm({ initial }: { initial: FlowInitial }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [motto, setMotto] = useState(initial.motto ?? "");
  const [passThreshold, setPassThreshold] = useState(initial.pass_threshold);
  const [steps, setSteps] = useState<Step[]>(initial.steps);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function removeStep(i: number) {
    setSteps((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/onboarding/flows/${initial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            title,
            motto,
            pass_threshold: passThreshold,
            steps: steps.map((s) => ({
              goal: s.goal,
              intro: s.intro ?? "",
              pass_criteria: s.pass_criteria ?? "",
              docs: s.docs.map((d) => ({
                doc_path: d.doc_path,
                heading_anchor: d.heading_anchor,
                highlight: d.highlight ?? "",
                reason: d.reason ?? "",
              })),
              questions: s.questions.map((q) => ({
                prompt: q.prompt,
                choices: q.choices ?? [],
                answer_idx: q.answer_idx ?? 0,
                explanation: q.explanation ?? "",
                expected_keywords: q.expected_keywords ?? [],
                min_keywords: q.min_keywords ?? 1,
              })),
            })),
          },
          brief: initial.brief ?? undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSuccess(true);
      setTimeout(() => router.push("/admin/onboarding/flows-list"), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ll-card" style={cardStyle}>
        <Row label="Tiêu đề"><input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} /></Row>
        <Row label="Motto"><input value={motto} onChange={(e) => setMotto(e.target.value)} style={inputStyle} /></Row>
        <Row label={`Pass threshold (${passThreshold}%)`}>
          <input type="range" min={50} max={90} step={5} value={passThreshold} onChange={(e) => setPassThreshold(Number(e.target.value))} style={{ width: "100%" }} />
        </Row>
      </div>

      {steps.map((step, i) => (
        <details key={step.id + "_" + i} className="ll-card" style={cardStyle} open>
          <summary style={{ display: "flex", justifyContent: "space-between", cursor: "pointer", gap: 10 }}>
            <strong>Step {i + 1} · {step.goal.slice(0, 60)}</strong>
            <button type="button" onClick={(e) => { e.preventDefault(); removeStep(i); }} style={btnTinyDanger}>Xoá step</button>
          </summary>
          <div style={{ marginTop: 12 }}>
            <Row label="Mục tiêu"><input value={step.goal} onChange={(e) => updateStep(i, { goal: e.target.value })} style={inputStyle} /></Row>
            <Row label="Intro">
              <textarea
                value={step.intro ?? ""}
                onChange={(e) => updateStep(i, { intro: e.target.value })}
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", minHeight: 100 }}
              />
            </Row>
            <Row label="Pass criteria"><input value={step.pass_criteria ?? ""} onChange={(e) => updateStep(i, { pass_criteria: e.target.value })} style={inputStyle} /></Row>

            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>Tài liệu ({step.docs.length})</strong>
              {step.docs.map((d, j) => (
                <div key={d.id + "_" + j} style={{ padding: 8, background: "var(--ll-surface-soft)", borderRadius: 6, marginTop: 6 }}>
                  <input
                    value={d.doc_path}
                    onChange={(e) => {
                      const nd = step.docs.slice();
                      nd[j] = { ...d, doc_path: e.target.value };
                      updateStep(i, { docs: nd });
                    }}
                    placeholder="knowledge/zone/..."
                    style={{ ...inputStyle, padding: "6px 10px", fontFamily: "ui-monospace,monospace", fontSize: 12 }}
                  />
                  <input
                    value={d.highlight ?? ""}
                    onChange={(e) => {
                      const nd = step.docs.slice();
                      nd[j] = { ...d, highlight: e.target.value };
                      updateStep(i, { docs: nd });
                    }}
                    placeholder="Highlight đoạn cần đọc"
                    style={{ ...inputStyle, padding: "6px 10px", marginTop: 4, fontSize: 12 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>Câu hỏi ({step.questions.length})</strong>
              {step.questions.map((q, k) => (
                <div key={q.id + "_" + k} style={{ padding: 10, background: "var(--ll-surface-soft)", borderRadius: 6, marginTop: 6 }}>
                  <input
                    value={q.prompt}
                    onChange={(e) => {
                      const nq = step.questions.slice();
                      nq[k] = { ...q, prompt: e.target.value };
                      updateStep(i, { questions: nq });
                    }}
                    placeholder="Câu hỏi"
                    style={{ ...inputStyle, padding: "6px 10px", fontSize: 13 }}
                  />
                  {q.choices && q.choices.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {q.choices.map((c, ci) => (
                        <label key={ci} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                          <input
                            type="radio"
                            name={`q-${i}-${k}`}
                            checked={q.answer_idx === ci}
                            onChange={() => {
                              const nq = step.questions.slice();
                              nq[k] = { ...q, answer_idx: ci };
                              updateStep(i, { questions: nq });
                            }}
                          />
                          <input
                            value={c}
                            onChange={(e) => {
                              const ch = q.choices!.slice();
                              ch[ci] = e.target.value;
                              const nq = step.questions.slice();
                              nq[k] = { ...q, choices: ch };
                              updateStep(i, { questions: nq });
                            }}
                            style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={q.explanation ?? ""}
                    onChange={(e) => {
                      const nq = step.questions.slice();
                      nq[k] = { ...q, explanation: e.target.value };
                      updateStep(i, { questions: nq });
                    }}
                    placeholder="Giải thích sau khi chấm"
                    rows={2}
                    style={{ ...inputStyle, marginTop: 6, fontSize: 12, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13 }}>{error}</div>
      )}
      {success && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#ecfdf5", border: "1px solid #6ee7b7", color: "#065f46", fontSize: 13 }}>
          ✓ Đã lưu. Đang quay về listing…
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={save} disabled={busy} style={btnPrimary}>
          💾 {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
        <button type="button" onClick={() => router.push("/admin/onboarding/flows-list")} style={btnGhost}>
          Huỷ
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--ll-muted)", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "white", border: "1px solid var(--ll-border)", borderRadius: 12, padding: 18 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--ll-border)", fontSize: 14, background: "white", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, background: "var(--ll-green)", color: "white", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnGhost: React.CSSProperties = { padding: "10px 18px", borderRadius: 10, background: "white", color: "var(--ll-ink)", border: "1px solid var(--ll-border)", cursor: "pointer", fontSize: 14, fontWeight: 500 };
const btnTinyDanger: React.CSSProperties = { padding: "3px 8px", borderRadius: 6, background: "transparent", color: "#b91c1c", border: "1px solid #fca5a5", fontSize: 11, cursor: "pointer" };
