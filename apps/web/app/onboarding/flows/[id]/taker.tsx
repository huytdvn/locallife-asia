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
  // MC fields (preferred)
  choices: string[] | null;
  answer_idx: number | null;
  explanation: string | null;
  // Legacy keyword
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
  review_quiz_id?: number | null;
}

interface QuestionGrade {
  question_id: number;
  correct: boolean;
  answer_idx: number | null;
  user_answer: string | number | null;
  explanation: string | null;
}

interface SubmitResult {
  attempt_id: number;
  passed: boolean;
  score_pct: number;
  step_results: Array<{
    step_id: number;
    score_pct: number;
    passed: boolean;
    question_grades: QuestionGrade[];
  }>;
  review_quiz_id: number | null;
}

// Palette vibrant cho từng step — rotate qua list để mỗi step có màu riêng
const STEP_PALETTE = [
  { bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)", accent: "#d97706", emoji: "🌱" },
  { bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)", accent: "#2563eb", emoji: "🌊" },
  { bg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)", accent: "#db2777", emoji: "🌸" },
  { bg: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", accent: "#059669", emoji: "🍀" },
  { bg: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", accent: "#7c3aed", emoji: "🔮" },
];

const ENCOURAGE = [
  "Đi thôi nào, từng bước một! 💪",
  "Bạn đang làm tốt lắm 🌟",
  "Đọc kỹ tài liệu là pass dễ thôi 📖",
  "Suy nghĩ chậm cũng được, không vội ☕",
  "Sai cũng không sao — học được là chính 🎯",
];

export function FlowTaker({ flow }: { flow: Flow }) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
  // answer: number (MC index) hoặc string (free text)
  const [answers, setAnswers] = useState<Record<number, number | string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const step = flow.steps[stepIdx];
  const isLast = stepIdx === flow.steps.length - 1;
  const palette = STEP_PALETTE[stepIdx % STEP_PALETTE.length];
  const encourage = ENCOURAGE[stepIdx % ENCOURAGE.length];

  function setAnswer(qid: number, val: number | string) {
    setAnswers((cur) => ({ ...cur, [qid]: val }));
  }

  function isMC(q: Question): boolean {
    return Array.isArray(q.choices) && q.choices.length > 0 && q.answer_idx !== null;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const payload = flow.steps.flatMap((s) =>
        s.questions.map((q) => ({
          step_id: s.id,
          question_id: q.id,
          answer: answers[q.id] ?? null,
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
      window.scrollTo({ top: 0, behavior: "smooth" });
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
        <div className="ll-card" style={{ ...cardStyle, textAlign: "center", background: result.passed ? "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)" : "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)" }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>
            {result.passed ? "🎉" : "💪"}
          </div>
          <h2 style={{ margin: "0 0 6px", color: result.passed ? "#059669" : "#c07600" }}>
            {result.passed ? "Pass rồi! Tuyệt vời." : "Chưa pass — nhưng còn cơ hội"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ll-ink-soft)" }}>
            Bạn đạt <strong>{result.score_pct}%</strong> ({passedSteps}/{result.step_results.length} bước pass).
            Cần ≥ {flow.pass_threshold}% để pass tổng.
          </p>
        </div>

        {result.review_quiz_id && result.passed && (
          <div className="ll-card" style={{ ...cardStyle, background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)", borderColor: "#7c3aed" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 36 }}>🔁</div>
              <div style={{ flex: 1 }}>
                <strong style={{ color: "#5b21b6", fontSize: 15 }}>Ôn lại trong tuần</strong>
                <p style={{ margin: "2px 0 8px", fontSize: 13, color: "var(--ll-ink-soft)" }}>
                  Đã có quiz ngắn để ôn lại nội dung vừa học. Làm lại trong tuần để khắc sâu kiến thức.
                </p>
                <button
                  type="button"
                  onClick={() => router.push(`/training/quizzes/${result.review_quiz_id}`)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    background: "#7c3aed",
                    color: "white",
                    border: "none",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  ✨ Mở quiz ôn lại
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="ll-card" style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>📊 Chi tiết từng bước</h3>
          {result.step_results.map((s, i) => (
            <div
              key={s.step_id}
              style={{
                padding: "10px 12px",
                borderLeft: `4px solid ${s.passed ? "#10b981" : "#fbbf24"}`,
                background: s.passed ? "#ecfdf5" : "#fffbeb",
                borderRadius: "0 8px 8px 0",
                marginBottom: 8,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{STEP_PALETTE[i % STEP_PALETTE.length].emoji} Step {i + 1}</strong>
                <span>{s.score_pct}% — {s.passed ? "✓ pass" : "× chưa pass"}</span>
              </div>
              {/* Per-question feedback */}
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                {s.question_grades.map((qg, qi) => {
                  const stepObj = flow.steps[i];
                  const q = stepObj?.questions[qi];
                  if (!q) return null;
                  return (
                    <div key={qg.question_id} style={{ fontSize: 12, padding: "4px 0" }}>
                      <div>
                        {qg.correct ? "✓" : "✗"} {q.prompt}
                      </div>
                      {!qg.correct && q.choices && qg.answer_idx !== null && (
                        <div style={{ paddingLeft: 18, color: "#059669", marginTop: 2 }}>
                          ➜ Đáp án đúng: <strong>{q.choices[qg.answer_idx]}</strong>
                        </div>
                      )}
                      {qg.explanation && !qg.correct && (
                        <div style={{ paddingLeft: 18, color: "var(--ll-muted)", fontStyle: "italic", marginTop: 2 }}>
                          💡 {qg.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!result.passed && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setStepIdx(0);
                window.scrollTo({ top: 0 });
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
        {palette.emoji} Bước {stepIdx + 1}/{flow.steps.length} · {encourage}
        <div style={{
          flex: 1,
          height: 6,
          background: "var(--ll-border)",
          borderRadius: 3,
          marginLeft: 8,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${((stepIdx + 1) / flow.steps.length) * 100}%`,
            background: palette.accent,
            transition: "width 200ms",
          }} />
        </div>
      </div>

      <div className="ll-card" style={{ ...cardStyle, background: palette.bg, borderColor: palette.accent }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 20, color: palette.accent }}>
          {palette.emoji} {step.goal}
        </h2>
        {step.intro && (
          <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ll-ink-soft)" }}>
            {step.intro}
          </p>
        )}
        {step.pass_criteria && (
          <p style={{ margin: 0, fontSize: 12, color: palette.accent, fontStyle: "italic" }}>
            🎯 {step.pass_criteria}
          </p>
        )}
      </div>

      {step.docs.length > 0 && (
        <div className="ll-card" style={cardStyle}>
          <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>📚 Đọc trước để trả lời tốt hơn</h3>
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
                  borderLeft: `3px solid ${palette.accent}`,
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
        <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>✏️ Trả lời nào</h3>
        {step.questions.map((q, i) => (
          <div key={q.id} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              <span style={{
                display: "inline-block",
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: palette.accent,
                color: "white",
                textAlign: "center",
                lineHeight: "24px",
                fontSize: 12,
                fontWeight: 700,
                marginRight: 8,
              }}>
                {i + 1}
              </span>
              {q.prompt}
            </div>
            {isMC(q) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.choices!.map((c, j) => {
                  const picked = answers[q.id] === j;
                  return (
                    <label
                      key={j}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 14px",
                        borderRadius: 10,
                        cursor: "pointer",
                        background: picked ? palette.bg : "white",
                        border: picked ? `2px solid ${palette.accent}` : "1px solid var(--ll-border)",
                        fontSize: 13,
                        transition: "all 120ms",
                      }}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={picked}
                        onChange={() => setAnswer(q.id, j)}
                        style={{ marginTop: 3, accentColor: palette.accent }}
                      />
                      <span style={{ flex: 1 }}>{c}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              // Legacy keyword fallback
              <textarea
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
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
            )}
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
          <button type="button" onClick={submit} disabled={busy} style={{ ...btnPrimary, background: palette.accent }}>
            ✓ {busy ? "Đang chấm…" : "Nộp bài"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setStepIdx((cur) => cur + 1)}
            style={{ ...btnPrimary, background: palette.accent }}
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
