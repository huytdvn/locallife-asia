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

interface Flow {
  id: number;
  title: string;
  motto: string | null;
  pass_threshold: number;
  steps: Step[];
}

interface SubmitResult {
  attempt_id: number;
  passed: boolean;
  score_pct: number;
  step_results: Array<{
    step_id: number;
    score_pct: number;
    passed: boolean;
  }>;
}

export function FlowTaker({ flow }: { flow: Flow }) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const step = flow.steps[stepIdx];
  const isLast = stepIdx === flow.steps.length - 1;

  function setAnswer(qid: number, val: string) {
    setAnswers((cur) => ({ ...cur, [qid]: val }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = flow.steps.flatMap((s) =>
        s.questions.map((q) => ({
          step_id: s.id,
          question_id: q.id,
          answer: answers[q.id] ?? "",
        }))
      );
      const r = await fetch(`/api/onboarding/flows/${flow.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j as SubmitResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const passedSteps = result.step_results.filter((s) => s.passed).length;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>
            {result.passed ? "🎉" : "💪"}
          </div>
          <h2 style={{ margin: "0 0 6px", color: result.passed ? "var(--ll-green-dark)" : "#c07600" }}>
            {result.passed ? "Pass rồi! Tuyệt vời." : "Chưa pass — nhưng còn cơ hội"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ll-muted)" }}>
            Bạn đạt <strong>{result.score_pct}%</strong> ({passedSteps}/{result.step_results.length} bước pass).
            Cần ≥ {flow.pass_threshold}% để pass tổng.
          </p>
        </div>

        <div className="ll-card" style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Chi tiết từng bước</h3>
          {result.step_results.map((s, i) => (
            <div
              key={s.step_id}
              style={{
                padding: "8px 12px",
                borderLeft: `3px solid ${s.passed ? "var(--ll-green-bright)" : "#fdba74"}`,
                background: s.passed ? "var(--ll-green-soft)" : "#fff7ed",
                borderRadius: "0 6px 6px 0",
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              Step {i + 1}: <strong>{s.score_pct}%</strong> — {s.passed ? "✓ pass" : "× chưa pass"}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!result.passed && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setStepIdx(0);
              }}
              style={btnPrimary}
            >
              🔄 Làm lại
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/onboarding/flows")}
            style={btnGhost}
          >
            Về danh sách lộ trình
          </button>
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div style={cardStyle}>
        <p>Lộ trình này không có bước nào — liên hệ admin.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        fontSize: 12,
        color: "var(--ll-muted)",
      }}>
        Bước {stepIdx + 1}/{flow.steps.length}
        <div style={{
          flex: 1,
          height: 4,
          background: "var(--ll-border)",
          borderRadius: 2,
          marginLeft: 8,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${((stepIdx + 1) / flow.steps.length) * 100}%`,
            background: "var(--ll-green-bright)",
            transition: "width 200ms",
          }} />
        </div>
      </div>

      <div className="ll-card" style={cardStyle}>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "var(--ll-green-dark)" }}>
          {step.goal}
        </h2>
        {step.intro && (
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ll-ink-soft)" }}>
            {step.intro}
          </p>
        )}
        {step.pass_criteria && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--ll-muted)", fontStyle: "italic" }}>
            🎯 {step.pass_criteria}
          </p>
        )}
      </div>

      {step.docs.length > 0 && (
        <div className="ll-card" style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>📚 Tài liệu cần đọc</h3>
          {step.docs.map((d) => (
            <div
              key={d.id}
              style={{
                padding: 12,
                background: "var(--ll-surface-soft)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <a
                href={`/dashboard?doc=${encodeURIComponent(d.doc_path)}${d.heading_anchor ? "#" + d.heading_anchor : ""}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--ll-green-dark)", fontWeight: 600, textDecoration: "underline" }}
              >
                📄 {d.doc_path}{d.heading_anchor ? ` › ${d.heading_anchor}` : ""}
              </a>
              {d.reason && (
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--ll-muted)", fontStyle: "italic" }}>
                  {d.reason}
                </div>
              )}
              {d.highlight && (
                <blockquote style={{
                  borderLeft: "3px solid var(--ll-green-bright)",
                  margin: "8px 0 0",
                  padding: "4px 10px",
                  fontSize: 13,
                  color: "var(--ll-ink-soft)",
                  background: "white",
                  borderRadius: "0 6px 6px 0",
                }}>
                  {d.highlight}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ll-card" style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>✏️ Trả lời ngắn gọn</h3>
        {step.questions.map((q, i) => (
          <div key={q.id} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
              Câu {i + 1}: {q.prompt}
            </label>
            <textarea
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="Trả lời (1–3 câu)…"
              rows={3}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--ll-border)",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          padding: "10px 12px",
          borderRadius: 8,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#991b1b",
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setStepIdx((cur) => Math.max(0, cur - 1))}
          disabled={stepIdx === 0}
          style={btnGhost}
        >
          ← Trước
        </button>
        {isLast ? (
          <button type="button" onClick={submit} disabled={busy} style={btnPrimary}>
            ✓ {busy ? "Đang chấm…" : "Nộp bài"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIdx((cur) => cur + 1)}
            style={btnPrimary}
          >
            Bước tiếp →
          </button>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--ll-border)",
  borderRadius: 12,
  padding: 18,
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  background: "var(--ll-green)",
  color: "white",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};

const btnGhost: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 10,
  background: "white",
  color: "var(--ll-ink)",
  border: "1px solid var(--ll-border)",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 500,
};
