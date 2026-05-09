"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ALL_ROLES = ["employee", "lead", "admin", "host", "lok", "guest"] as const;
type R = (typeof ALL_ROLES)[number];

interface Question {
  id: string;
  prompt: string;
  choices: string[];
  answer_idx: number;
  explanation: string;
}

interface QuizInitial {
  id: number;
  title: string;
  motto: string | null;
  intro: string | null;
  audience: R[];
  doc_paths: string[];
  pass_threshold: number;
  format: "quiz" | "reading" | "flashcard";
  questions: Question[];
}

export function QuizEditForm({ initial }: { initial: QuizInitial }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [motto, setMotto] = useState(initial.motto ?? "");
  const [intro, setIntro] = useState(initial.intro ?? "");
  const [audience, setAudience] = useState<R[]>(initial.audience);
  const [docPaths, setDocPaths] = useState<string[]>(initial.doc_paths);
  const [docPathsRaw, setDocPathsRaw] = useState(initial.doc_paths.join("\n"));
  const [format, setFormat] = useState(initial.format);
  const [passThreshold, setPassThreshold] = useState(initial.pass_threshold);
  const [questions, setQuestions] = useState<Question[]>(initial.questions);
  const [busy, setBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateQ(i: number, patch: Partial<Question>) {
    setQuestions((cur) => cur.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function removeQ(i: number) {
    setQuestions((cur) => cur.filter((_, idx) => idx !== i));
  }
  function addQ() {
    setQuestions((cur) => [
      ...cur,
      {
        id: "q" + Date.now().toString(36),
        prompt: "",
        choices: ["", "", "", ""],
        answer_idx: 0,
        explanation: "",
      },
    ]);
  }

  async function regenerate() {
    if (!confirm("AI sẽ sinh lại toàn bộ câu hỏi từ tài liệu hiện tại. Câu cũ sẽ bị thay. Tiếp?")) return;
    setRegenBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/training/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docPaths: docPathsRaw.split(/\n+/).map((s) => s.trim()).filter(Boolean),
          audience,
          format,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setQuestions(j.draft.questions ?? []);
      if (j.draft.title) setTitle(j.draft.title);
      if (j.draft.motto) setMotto(j.draft.motto);
      if (j.draft.intro) setIntro(j.draft.intro);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const cleanedDocPaths = docPathsRaw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`/api/admin/training/quizzes/${initial.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            title,
            motto,
            intro,
            pass_threshold: passThreshold,
            questions,
          },
          audience,
          docPaths: cleanedDocPaths,
          format,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDocPaths(cleanedDocPaths);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        router.push("/admin/training");
        router.refresh();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="ll-card" style={cardStyle}>
        <Row label="Tiêu đề">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="Motto">
          <input value={motto} onChange={(e) => setMotto(e.target.value)} style={inputStyle} />
        </Row>
        <Row label="Intro">
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }} />
        </Row>
        <Row label={`Pass threshold (${passThreshold}%)`}>
          <input
            type="range"
            min={50}
            max={90}
            step={5}
            value={passThreshold}
            onChange={(e) => setPassThreshold(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </Row>
        <Row label="Audience (ai có thể làm quiz)">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALL_ROLES.map((r) => {
              const on = audience.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    setAudience((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))
                  }
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: "pointer",
                    border: on ? "2px solid var(--ll-green-dark)" : "1px solid var(--ll-border)",
                    background: on ? "var(--ll-green-soft)" : "white",
                    color: on ? "var(--ll-green-dark)" : "var(--ll-ink)",
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </Row>
        <Row label="Tài liệu nguồn (mỗi path 1 dòng — server validate)">
          <textarea
            value={docPathsRaw}
            onChange={(e) => setDocPathsRaw(e.target.value)}
            rows={Math.max(2, docPathsRaw.split("\n").length)}
            style={{ ...inputStyle, fontFamily: "ui-monospace,monospace", resize: "vertical" }}
          />
          <p style={{ fontSize: 11, color: "var(--ll-muted)", margin: "4px 0 0" }}>
            Hiện có {docPaths.length} doc. Đổi để AI gen từ nguồn khác.
          </p>
        </Row>
        <Row label="Format">
          <div style={{ display: "flex", gap: 6 }}>
            {(["quiz", "reading", "flashcard"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  border: format === f ? "2px solid var(--ll-green-dark)" : "1px solid var(--ll-border)",
                  background: format === f ? "var(--ll-green-soft)" : "white",
                  fontWeight: format === f ? 600 : 500,
                }}
              >
                {f === "quiz" ? "🎯 Quiz" : f === "reading" ? "📖 Đọc" : "🃏 Flashcard"}
              </button>
            ))}
          </div>
        </Row>
      </div>

      <div className="ll-card" style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Câu hỏi ({questions.length})</h3>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={regenerate}
              disabled={regenBusy || audience.length === 0}
              style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}
              title="AI sinh lại toàn bộ câu hỏi từ tài liệu hiện tại"
            >
              ✨ {regenBusy ? "Đang gen…" : "AI sinh lại từ docs"}
            </button>
            <button type="button" onClick={addQ} style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}>
              + Thêm câu
            </button>
          </div>
        </div>
        {questions.map((q, i) => (
          <div key={q.id + i} style={{ padding: 12, background: "var(--ll-surface-soft)", borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong style={{ fontSize: 12 }}>Câu {i + 1}</strong>
              <button type="button" onClick={() => removeQ(i)} style={btnTinyDanger}>Xoá</button>
            </div>
            <input value={q.prompt} onChange={(e) => updateQ(i, { prompt: e.target.value })} placeholder="Câu hỏi" style={inputStyle} />
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {q.choices.map((c, j) => (
                <label key={j} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="radio" name={`q-${i}`} checked={q.answer_idx === j} onChange={() => updateQ(i, { answer_idx: j })} />
                  <input
                    value={c}
                    onChange={(e) => {
                      const ch = q.choices.slice();
                      ch[j] = e.target.value;
                      updateQ(i, { choices: ch });
                    }}
                    style={{ ...inputStyle, padding: "5px 10px" }}
                  />
                </label>
              ))}
            </div>
            <textarea
              value={q.explanation}
              onChange={(e) => updateQ(i, { explanation: e.target.value })}
              placeholder="Giải thích sau khi chấm"
              rows={2}
              style={{ ...inputStyle, marginTop: 8, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        ))}
      </div>

      {error && (
        <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
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
        <button type="button" onClick={() => router.push("/admin/training")} style={btnGhost}>
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
