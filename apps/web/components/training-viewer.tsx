"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface TrainingStep {
  doc_path: string;
  note?: string;
  doc_id?: string;
  title?: string;
  status?: string;
  accessible?: boolean;
}

interface TrainingSection {
  name: string;
  steps: TrainingStep[];
}

interface TrainingPath {
  slug: string;
  title: string;
  subtitle?: string;
  duration?: string;
  owner?: string;
  sections: TrainingSection[];
  total_steps?: number;
  accessible_steps?: number;
}

interface ProgressInfo {
  started_at: string;
  updated_at: string;
  completed_steps: string[];
  quiz?: {
    attempts: Array<{ attempt_id: string; ts: string; score: number; passed: boolean }>;
    best_score: number;
    passed_at: string | null;
  };
}

interface MaskedQuestion {
  q: string;
  options: string[];
}

interface ScoredQuiz {
  attempt_id: string;
  slug: string;
  total: number;
  correct_count: number;
  score: number;
  passed: boolean;
  pass_threshold: number;
  per_question: Array<{
    q: string;
    your_answer: number;
    correct_answer: number;
    is_correct: boolean;
    explain?: string;
  }>;
}

export function TrainingViewer({ slug }: { slug: string }) {
  const [path, setPath] = useState<TrainingPath | null>(null);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/training/${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setPath(d.path)))
      .catch((e) => setError(String(e)));
    fetch(`/api/training/${encodeURIComponent(slug)}/progress`)
      .then((r) => r.json())
      .then((d) => setProgress(d.progress))
      .catch(() => {
        /* first time */
      });
  }, [slug]);

  const done = useMemo(
    () => new Set(progress?.completed_steps ?? []),
    [progress]
  );

  async function toggleStep(docPath: string) {
    const isDone = done.has(docPath);
    const res = await fetch(
      `/api/training/${encodeURIComponent(slug)}/progress`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_path: docPath, done: !isDone }),
      }
    );
    if (res.ok) {
      const { progress: p } = (await res.json()) as { progress: ProgressInfo };
      setProgress(p);
    }
  }

  const pct = useMemo(() => {
    if (!path) return 0;
    const total = path.total_steps ?? 0;
    return total === 0 ? 0 : Math.round((done.size / total) * 100);
  }, [path, done]);

  const allDone =
    !!path && path.total_steps !== undefined && done.size >= path.total_steps;

  if (error) {
    return (
      <div
        className="ll-card"
        style={{ color: "#b91c1c", textAlign: "center" }}
      >
        {error === "not_found_or_forbidden"
          ? "Không tìm thấy lộ trình hoặc role không có quyền."
          : `Lỗi: ${error}`}
      </div>
    );
  }
  if (!path) {
    return (
      <div
        className="ll-card"
        style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ll-muted)" }}
      >
        <span className="ll-typing">
          <span />
          <span />
          <span />
        </span>
        Đang tải lộ trình…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header
        className="ll-card-warm ll-anim-in"
        style={{ borderLeft: "6px solid var(--ll-green-bright)" }}
      >
        <h1 style={{ margin: 0, color: "var(--ll-green-dark)", fontSize: 24 }}>
          {path.title}
        </h1>
        {path.subtitle && (
          <p style={{ margin: "6px 0 0", color: "var(--ll-ink-soft)", fontSize: 14 }}>
            {path.subtitle}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginTop: 12,
            fontSize: 13,
            color: "var(--ll-muted)",
          }}
        >
          {path.duration && <span>⏱ {path.duration}</span>}
          <span>📚 {path.total_steps} bài</span>
          {path.owner && <span>👤 {path.owner}</span>}
          {progress?.quiz?.passed_at && (
            <span style={{ color: "var(--ll-green-bright)", fontWeight: 600 }}>
              ✓ Đã pass quiz · điểm best {Math.round(progress.quiz.best_score * 100)}%
            </span>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 6,
              fontSize: 13,
              color: "var(--ll-green-dark)",
              fontWeight: 600,
            }}
          >
            <span>Tiến độ đọc bài</span>
            <span>
              {done.size} / {path.total_steps} · {pct}%
            </span>
          </div>
          <div className="ll-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      {path.sections.map((section, si) => (
        <section
          key={section.name + si}
          className="ll-card ll-anim-in"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              color: "var(--ll-green-dark)",
              borderBottom: "2px solid var(--ll-green-soft)",
              paddingBottom: 6,
            }}
          >
            {section.name}
          </h2>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {section.steps.map((step, i) => (
              <StepRow
                key={step.doc_path + i}
                step={step}
                done={done.has(step.doc_path)}
                onToggle={() => toggleStep(step.doc_path)}
              />
            ))}
          </ol>
        </section>
      ))}

      <QuizSection
        slug={slug}
        canStart={allDone}
        progress={progress}
        onDone={(p) => setProgress(p)}
      />

      <footer
        style={{
          textAlign: "center",
          padding: 20,
          color: "var(--ll-muted)",
          fontSize: 13,
        }}
      >
        Tiến độ lưu server · admin xem được{" "}
        <Link href="/admin/training-report">báo cáo training</Link>. ·{" "}
        <Link href="/training">← Danh sách lộ trình</Link>
      </footer>
    </div>
  );
}

function StepRow({
  step,
  done,
  onToggle,
}: {
  step: TrainingStep;
  done: boolean;
  onToggle: () => void;
}) {
  const reachable = step.accessible !== false;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--ll-border)",
        background: done ? "var(--ll-green-soft)" : "white",
        transition: "all 120ms var(--ll-ease)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!reachable}
        aria-label={done ? "Đánh dấu chưa hoàn thành" : "Đánh dấu đã đọc"}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          border: `2px solid ${done ? "var(--ll-green-bright)" : "var(--ll-border)"}`,
          background: done ? "var(--ll-green-bright)" : "white",
          color: "white",
          cursor: reachable ? "pointer" : "not-allowed",
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          {reachable ? (
            <Link
              href={
                step.doc_id
                  ? `/admin/docs?doc=${step.doc_id}`
                  : `/admin/docs?path=${encodeURIComponent(step.doc_path)}`
              }
              target="_blank"
              rel="noreferrer"
              style={{
                fontWeight: 600,
                color: done ? "var(--ll-green-dark)" : "var(--ll-green-bright)",
                fontSize: 14,
              }}
            >
              {step.title ?? step.doc_path}
            </Link>
          ) : (
            <span
              style={{ fontWeight: 600, color: "var(--ll-muted)", fontSize: 14 }}
              title="Role của bạn không đọc được tài liệu này"
            >
              🔒 {step.title ?? step.doc_path}
            </span>
          )}
          {step.status === "draft" && (
            <span
              className="ll-badge"
              style={{
                background: "var(--ll-orange-soft)",
                color: "#c07600",
                fontSize: 10,
              }}
            >
              draft
            </span>
          )}
        </div>
        {step.note && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ll-muted)",
              marginTop: 2,
              lineHeight: 1.5,
            }}
          >
            {step.note}
          </div>
        )}
      </div>
    </li>
  );
}

function QuizSection({
  slug,
  canStart,
  progress,
  onDone,
}: {
  slug: string;
  canStart: boolean;
  progress: ProgressInfo | null;
  onDone: (p: ProgressInfo) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MaskedQuestion[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<ScoredQuiz | null>(null);

  const passedBefore = !!progress?.quiz?.passed_at;

  async function startQuiz() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/training/${encodeURIComponent(slug)}/quiz`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        attempt_id?: string;
        questions?: MaskedQuestion[];
        error?: string;
      };
      if (!res.ok || !data.attempt_id || !data.questions) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setAttemptId(data.attempt_id);
      setQuestions(data.questions);
      setAnswers(new Array(data.questions.length).fill(-1));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!attemptId || !questions) return;
    if (answers.some((a) => a < 0)) {
      setError("Vui lòng trả lời hết các câu trước khi nộp");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/training/${encodeURIComponent(slug)}/quiz`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: attemptId, answers }),
      });
      const data = (await res.json()) as ScoredQuiz | { error: string };
      if ("error" in data) {
        setError(data.error);
        return;
      }
      setResult(data);
      const pRes = await fetch(`/api/training/${encodeURIComponent(slug)}/progress`);
      if (pRes.ok) {
        const { progress: p } = (await pRes.json()) as { progress: ProgressInfo };
        onDone(p);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setAttemptId(null);
    setQuestions(null);
    setAnswers([]);
    setResult(null);
    setError(null);
  }

  return (
    <section
      className="ll-card ll-anim-in"
      style={{
        borderLeft: `4px solid ${canStart ? "var(--ll-orange)" : "var(--ll-border)"}`,
        background: canStart ? "var(--ll-orange-soft)" : "var(--ll-surface-soft)",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: 16,
          color: "var(--ll-green-dark)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        🎯 Bài kiểm tra cuối lộ trình
        {passedBefore && (
          <span
            className="ll-badge"
            style={{
              background: "var(--ll-green-bright)",
              color: "white",
              fontSize: 10,
            }}
          >
            PASSED
          </span>
        )}
      </h2>
      <p style={{ margin: "6px 0 12px", color: "var(--ll-muted)", fontSize: 13 }}>
        {!canStart
          ? "Hoàn thành 100% các bài đọc ở trên để mở khoá bài kiểm tra."
          : result
            ? `Kết quả: ${result.correct_count}/${result.total} · ${Math.round(result.score * 100)}%`
            : questions
              ? "Chọn đáp án cho từng câu rồi bấm Nộp bài."
              : "AI sẽ ra 5 câu hỏi từ nội dung bạn vừa học. Điểm đạt ≥ 80%."}
      </p>

      {error && (
        <div
          style={{
            padding: 10,
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          {error}
        </div>
      )}

      {!questions && !result && (
        <button
          type="button"
          onClick={startQuiz}
          disabled={!canStart || loading}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: canStart ? "var(--ll-orange)" : "var(--ll-muted)",
            color: "white",
            fontWeight: 600,
            cursor: canStart && !loading ? "pointer" : "not-allowed",
            fontSize: 14,
          }}
        >
          {loading ? "AI đang soạn đề…" : passedBefore ? "Làm lại bài kiểm tra" : "Bắt đầu kiểm tra"}
        </button>
      )}

      {questions && !result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          {questions.map((q, qi) => (
            <div
              key={qi}
              style={{
                padding: 14,
                background: "white",
                borderRadius: 8,
                border: "1px solid var(--ll-border)",
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ll-ink)",
                  marginBottom: 10,
                  lineHeight: 1.5,
                }}
              >
                Câu {qi + 1}. {q.q}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: answers[qi] === oi ? "var(--ll-green-soft)" : "transparent",
                      border:
                        answers[qi] === oi
                          ? "1px solid var(--ll-green-bright)"
                          : "1px solid var(--ll-border)",
                      cursor: "pointer",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${qi}`}
                      checked={answers[qi] === oi}
                      onChange={() => {
                        const next = [...answers];
                        next[qi] = oi;
                        setAnswers(next);
                      }}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <strong>{String.fromCharCode(65 + oi)}.</strong> {opt}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={submit}
              disabled={loading || answers.some((a) => a < 0)}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background:
                  answers.some((a) => a < 0) ? "var(--ll-muted)" : "var(--ll-green)",
                color: "white",
                fontWeight: 600,
                cursor:
                  answers.some((a) => a < 0) || loading ? "not-allowed" : "pointer",
                fontSize: 14,
              }}
            >
              {loading ? "Đang chấm…" : "Nộp bài"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={loading}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid var(--ll-border)",
                background: "white",
                cursor: "pointer",
              }}
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 10,
              background: result.passed ? "var(--ll-green-soft)" : "#fef2f2",
              border: `2px solid ${result.passed ? "var(--ll-green-bright)" : "#fca5a5"}`,
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: result.passed ? "var(--ll-green-dark)" : "#b91c1c",
              }}
            >
              {result.passed ? "🎉 PASS!" : "Chưa đạt — ôn lại + thử lại"}
            </div>
            <div style={{ fontSize: 14, color: "var(--ll-ink)", marginTop: 4 }}>
              Đúng {result.correct_count}/{result.total} câu · {Math.round(result.score * 100)}% (cần ≥ {Math.round(result.pass_threshold * 100)}%)
            </div>
          </div>
          {result.per_question.map((pq, qi) => (
            <div
              key={qi}
              style={{
                padding: 12,
                borderRadius: 8,
                background: pq.is_correct ? "var(--ll-green-mist)" : "#fef2f2",
                borderLeft: `4px solid ${pq.is_correct ? "var(--ll-green-bright)" : "#dc2626"}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ll-ink)" }}>
                {pq.is_correct ? "✓" : "✗"} Câu {qi + 1}. {pq.q}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: "var(--ll-muted)" }}>
                Đáp án đúng: <strong>{String.fromCharCode(65 + pq.correct_answer)}</strong>
                {!pq.is_correct && (
                  <>
                    {" · "}bạn chọn:{" "}
                    <strong>
                      {pq.your_answer >= 0 ? String.fromCharCode(65 + pq.your_answer) : "bỏ trống"}
                    </strong>
                  </>
                )}
              </div>
              {pq.explain && (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 4,
                    color: "var(--ll-ink-soft)",
                    fontStyle: "italic",
                  }}
                >
                  💡 {pq.explain}
                </div>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid var(--ll-border)",
              background: "white",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Làm lại
          </button>
        </div>
      )}
    </section>
  );
}
