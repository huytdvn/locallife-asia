"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PublicQ {
  id: string;
  prompt: string;
  choices: string[];
}

interface Quiz {
  id: number;
  title: string;
  motto: string | null;
  intro: string | null;
  pass_threshold: number;
  format: "quiz" | "reading" | "flashcard";
  questions: PublicQ[];
}

interface AttemptDetail {
  question_id: string;
  correct: boolean;
  chosen_idx: number;
  answer_idx: number;
  explanation: string;
}

interface AttemptResult {
  attempt_id: number;
  passed: boolean;
  score_pct: number;
  details: AttemptDetail[];
}

export function QuizTaker({ quiz }: { quiz: Quiz }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  function pick(qid: string, choiceIdx: number) {
    setAnswers((cur) => ({ ...cur, [qid]: choiceIdx }));
  }

  async function submit() {
    if (Object.keys(answers).length !== quiz.questions.length) {
      setError(`Còn ${quiz.questions.length - Object.keys(answers).length} câu chưa trả lời`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = quiz.questions.map((q) => ({
        question_id: q.id,
        choice_idx: answers[q.id],
      }));
      const r = await fetch(`/api/training/quizzes/${quiz.id}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setResult(j as AttemptResult);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const detailById = new Map(result.details.map((d) => [d.question_id, d]));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>
            {result.passed ? "🎉" : "💪"}
          </div>
          <h2 style={{ margin: "0 0 6px", color: result.passed ? "var(--ll-green-dark)" : "#c07600" }}>
            {result.passed ? "Pass! Quá đỉnh." : "Chưa đạt — đọc lại tài liệu rồi thử nữa nhé"}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ll-muted)" }}>
            <strong>{result.score_pct}%</strong> · cần ≥ {quiz.pass_threshold}% để pass
          </p>
        </div>

        {quiz.questions.map((q, i) => {
          const d = detailById.get(q.id);
          if (!d) return null;
          return (
            <div
              key={q.id}
              className="ll-card"
              style={{
                ...cardStyle,
                borderColor: d.correct ? "var(--ll-green-bright)" : "#fdba74",
              }}
            >
              <div style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>Câu {i + 1}:</strong> {q.prompt}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {q.choices.map((c, j) => {
                  const isYour = d.chosen_idx === j;
                  const isCorrect = d.answer_idx === j;
                  return (
                    <div
                      key={j}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        background: isCorrect
                          ? "var(--ll-green-soft)"
                          : isYour
                            ? "#fef2f2"
                            : "transparent",
                        border: isCorrect
                          ? "1px solid var(--ll-green-bright)"
                          : isYour
                            ? "1px solid #fca5a5"
                            : "1px solid var(--ll-border)",
                        fontSize: 13,
                      }}
                    >
                      {isCorrect ? "✓ " : isYour ? "✗ " : ""}
                      {c}
                      {isYour && !isCorrect && " (bạn chọn)"}
                    </div>
                  );
                })}
              </div>
              {d.explanation && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    background: "var(--ll-surface-soft)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--ll-ink-soft)",
                  }}
                >
                  💡 {d.explanation}
                </div>
              )}
            </div>
          );
        })}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {!result.passed && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setAnswers({});
                window.scrollTo({ top: 0 });
              }}
              style={btnPrimary}
            >
              🔄 Làm lại
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/training/quizzes")}
            style={btnGhost}
          >
            Về danh sách quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {quiz.intro && (
        <div className="ll-card" style={cardStyle}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ll-ink-soft)" }}>{quiz.intro}</p>
        </div>
      )}

      {quiz.questions.map((q, i) => (
        <div key={q.id} className="ll-card" style={cardStyle}>
          <div style={{ marginBottom: 10, fontSize: 14, fontWeight: 500 }}>
            Câu {i + 1}/{quiz.questions.length}: {q.prompt}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.choices.map((c, j) => {
              const picked = answers[q.id] === j;
              return (
                <label
                  key={j}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "9px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: picked ? "var(--ll-green-soft)" : "white",
                    border: picked ? "2px solid var(--ll-green-dark)" : "1px solid var(--ll-border)",
                    fontSize: 13,
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={picked}
                    onChange={() => pick(q.id, j)}
                    style={{ marginTop: 2 }}
                  />
                  <span>{c}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}

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

      <button type="button" onClick={submit} disabled={busy} style={btnPrimary}>
        ✓ {busy ? "Đang chấm…" : "Nộp bài & xem kết quả"}
      </button>
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
