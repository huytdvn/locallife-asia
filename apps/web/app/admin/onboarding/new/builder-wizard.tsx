"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "intake" | "ideas" | "review" | "assign" | "done";

interface Idea {
  title: string;
  motto: string;
  why: string;
  rough_steps: string[];
}

interface DocRef {
  doc_path: string;
  heading_anchor: string | null;
  highlight: string;
  reason: string;
}

interface Question {
  prompt: string;
  expected_keywords: string[];
  min_keywords: number;
}

interface StepDraft {
  goal: string;
  intro: string;
  pass_criteria: string;
  docs: DocRef[];
  questions: Question[];
}

interface FlowDraft {
  title: string;
  motto: string;
  pass_threshold: number;
  steps: StepDraft[];
}

const ALL_ROLES = ["employee", "lead", "admin", "host", "lok", "guest"] as const;
type R = (typeof ALL_ROLES)[number];

export function OnboardingBuilderWizard({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intake");

  // Intake phase
  const [audienceRole, setAudienceRole] = useState<R>("employee");
  const [level, setLevel] = useState<"entry" | "mid" | "senior">("entry");
  const [brief, setBrief] = useState("");
  const [motto, setMotto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ideas phase
  const [ideas, setIdeas] = useState<Idea[]>([]);

  // Review phase
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [savedFlowId, setSavedFlowId] = useState<number | null>(null);

  // Assign phase
  const [emailsRaw, setEmailsRaw] = useState("");
  const [pickedRoles, setPickedRoles] = useState<R[]>([]);

  async function suggestIdeas() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/onboarding/flows/suggest-ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audienceRole, level }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setIdeas(j.ideas ?? []);
      setPhase("ideas");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function pickIdea(idea: Idea) {
    setBrief(idea.why + "\n\n" + idea.rough_steps.map((s, i) => `${i + 1}. ${s}`).join("\n"));
    setMotto(idea.motto);
    setPhase("intake");
  }

  async function generate() {
    if (brief.trim().length < 8) {
      setError("Brief cần ít nhất 8 ký tự, hoặc bấm AI gợi ý ở trên");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/onboarding/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          audienceRole,
          level,
          motto: motto.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDraft(j.draft as FlowDraft);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setDraft(null);
    await generate();
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/onboarding/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          brief: brief.trim(),
          audienceRole, // để server gen review quiz đi kèm
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSavedFlowId(j.id);
      setPhase("assign");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!savedFlowId) return;
    const emails = emailsRaw
      .split(/[\s,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.includes("@"));
    if (emails.length === 0 && pickedRoles.length === 0) {
      setError("Cần chọn ít nhất 1 email hoặc 1 role để giao bài");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/onboarding/flows/${savedFlowId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails, roles: pickedRoles }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);

      const pubR = await fetch(`/api/admin/onboarding/flows/${savedFlowId}/publish`, {
        method: "POST",
      });
      if (!pubR.ok) {
        const pj = await pubR.json().catch(() => ({}));
        console.warn("publish failed", pj);
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function updateStep(idx: number, patch: Partial<StepDraft>) {
    if (!draft) return;
    const steps = draft.steps.slice();
    steps[idx] = { ...steps[idx], ...patch };
    setDraft({ ...draft, steps });
  }

  function removeStep(idx: number) {
    if (!draft) return;
    const steps = draft.steps.slice();
    steps.splice(idx, 1);
    setDraft({ ...draft, steps });
  }

  // ─── render ────────────────────────────────────────────────────────

  if (phase === "intake") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={cardStyle}>
          <Row label="Lộ trình này dành cho ai?">
            <select
              value={audienceRole}
              onChange={(e) => setAudienceRole(e.target.value as R)}
              style={inputStyle}
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
              style={{ ...inputStyle, marginLeft: 8 }}
            >
              <option value="entry">Mới vào</option>
              <option value="mid">Đã quen việc</option>
              <option value="senior">Senior</option>
            </select>
          </Row>

          <Row label="Motto (1 câu hype) — không bắt buộc">
            <input
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="vd: Tuần đầu, mình lên đỉnh cùng nhau ✨"
              style={inputStyle}
            />
          </Row>

          <Row label="Ý tưởng chính (free type)">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={`vd: Tuần đầu cho host mới — hiểu giá trị Local Life, biết cách viết mô tả homestay, xử lý booking đầu tiên.\nCứ tả thoải mái, AI sẽ ghép thành lộ trình.`}
              rows={6}
              style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
            />
          </Row>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button
              type="button"
              onClick={suggestIdeas}
              disabled={busy}
              style={btnGhost}
              title="AI đọc knowledge base + đề xuất 3 chủ đề onboarding"
            >
              ✨ {busy ? "Đang nghĩ…" : "AI gợi ý ý tưởng"}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={busy || brief.trim().length < 8}
              style={btnPrimary}
            >
              🚀 {busy ? "Đang dựng…" : "Tạo lộ trình"}
            </button>
          </div>

          {error && <ErrorBox text={error} />}
        </div>

        <FootHint />
      </div>
    );
  }

  if (phase === "ideas") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ color: "var(--ll-muted)", fontSize: 13 }}>
          Đây là 3 hướng khác nhau. Pick 1 → quay lại bước trước với motto + brief đã điền sẵn. Vẫn edit được.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
          {ideas.map((idea, i) => (
            <div key={i} className="ll-card" style={{ ...cardStyle, cursor: "pointer" }} onClick={() => pickIdea(idea)}>
              <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{idea.title}</h3>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontStyle: "italic", color: "var(--ll-green-dark)" }}>
                {idea.motto}
              </p>
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ll-muted)" }}>
                {idea.why}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {idea.rough_steps.map((s, j) => (
                  <li key={j} style={{ marginBottom: 2 }}>{s}</li>
                ))}
              </ul>
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--ll-green-dark)", fontWeight: 600 }}>
                Pick lộ trình này →
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPhase("intake")} style={btnGhost}>
          ← Quay lại
        </button>
      </div>
    );
  }

  if (phase === "review" && draft) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={cardStyle}>
          <Row label="Tiêu đề lộ trình">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={inputStyle}
            />
          </Row>
          <Row label="Motto">
            <input
              value={draft.motto}
              onChange={(e) => setDraft({ ...draft, motto: e.target.value })}
              style={inputStyle}
            />
          </Row>
          <Row label={`Pass threshold (${draft.pass_threshold}%)`}>
            <input
              type="range"
              min={50}
              max={90}
              step={5}
              value={draft.pass_threshold}
              onChange={(e) => setDraft({ ...draft, pass_threshold: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </Row>
        </div>

        {draft.steps.map((step, i) => (
          <details key={i} className="ll-card" style={cardStyle} open>
            <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>Step {i + 1} · {step.goal.slice(0, 80)}</strong>
              <button type="button" onClick={(e) => { e.preventDefault(); removeStep(i); }} style={btnTinyDanger}>
                Xoá step
              </button>
            </summary>
            <div style={{ marginTop: 12 }}>
              <Row label="Mục tiêu">
                <input
                  value={step.goal}
                  onChange={(e) => updateStep(i, { goal: e.target.value })}
                  style={inputStyle}
                />
              </Row>
              <Row label="Intro (markdown)">
                <textarea
                  value={step.intro}
                  onChange={(e) => updateStep(i, { intro: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
                />
              </Row>
              <Row label="Pass criteria">
                <input
                  value={step.pass_criteria}
                  onChange={(e) => updateStep(i, { pass_criteria: e.target.value })}
                  style={inputStyle}
                />
              </Row>

              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>Tài liệu tham khảo</strong>
                {step.docs.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--ll-muted)", marginTop: 4 }}>(không có)</p>
                ) : step.docs.map((d, j) => (
                  <div key={j} style={{
                    background: "var(--ll-surface-soft)",
                    borderRadius: 8,
                    padding: 10,
                    marginTop: 6,
                    fontSize: 12,
                  }}>
                    <a
                      href={`/dashboard?doc=${encodeURIComponent(d.doc_path)}${d.heading_anchor ? "#" + d.heading_anchor : ""}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--ll-green-dark)", fontWeight: 600 }}
                    >
                      📄 {d.doc_path}{d.heading_anchor ? ` › ${d.heading_anchor}` : ""}
                    </a>
                    <div style={{ marginTop: 4, fontStyle: "italic" }}>{d.reason}</div>
                    <blockquote style={{
                      borderLeft: "3px solid var(--ll-green-bright)",
                      margin: "6px 0 0",
                      padding: "2px 8px",
                      color: "var(--ll-ink-soft)",
                    }}>
                      {d.highlight}
                    </blockquote>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>Câu hỏi chấm pass/fail</strong>
                {step.questions.map((q, k) => (
                  <div key={k} style={{ marginTop: 6 }}>
                    <input
                      value={q.prompt}
                      onChange={(e) => {
                        const qs = step.questions.slice();
                        qs[k] = { ...q, prompt: e.target.value };
                        updateStep(i, { questions: qs });
                      }}
                      style={inputStyle}
                    />
                    <div style={{ fontSize: 11, color: "var(--ll-muted)", marginTop: 2 }}>
                      Keywords cần có: {q.expected_keywords.join(", ")} · cần ≥ {q.min_keywords}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}

        {error && <ErrorBox text={error} />}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={regenerate} disabled={busy} style={btnGhost}>
            🔄 Sinh lại
          </button>
          <button type="button" onClick={save} disabled={busy || draft.steps.length === 0} style={btnPrimary}>
            💾 {busy ? "Đang lưu…" : "Lưu & sang bước giao bài"}
          </button>
          <button type="button" onClick={() => setPhase("intake")} style={btnGhost}>
            ← Sửa brief
          </button>
        </div>
      </div>
    );
  }

  if (phase === "assign") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={cardStyle}>
          <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>
            🎯 Giao bài cho ai?
          </h3>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ll-muted)" }}>
            Chọn email cụ thể HOẶC broadcast theo role. Có thể chọn cả hai. Created by: {adminEmail}
          </p>

          <Row label="Email cụ thể (cách nhau bằng dấu phẩy / xuống dòng)">
            <textarea
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder="alice@locallife.asia, bob@locallife.asia"
              rows={3}
              style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
            />
          </Row>

          <Row label="Hoặc broadcast theo role">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_ROLES.map((r) => {
                const picked = pickedRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPickedRoles((cur) =>
                      cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]
                    )}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      fontSize: 13,
                      cursor: "pointer",
                      border: picked ? "2px solid var(--ll-green-dark)" : "1px solid var(--ll-border)",
                      background: picked ? "var(--ll-green-soft)" : "white",
                      color: picked ? "var(--ll-green-dark)" : "var(--ll-ink)",
                      fontWeight: picked ? 600 : 500,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </Row>

          {error && <ErrorBox text={error} />}

          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={assign} disabled={busy} style={btnPrimary}>
              ✓ {busy ? "Đang gửi…" : "Giao bài & publish"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="ll-card" style={{ ...cardStyle, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
        <h2 style={{ margin: "0 0 8px", color: "var(--ll-green-dark)" }}>
          Lộ trình đã sẵn sàng!
        </h2>
        <p style={{ color: "var(--ll-muted)", fontSize: 13, marginBottom: 14 }}>
          User được giao bài sẽ thấy nó trong dashboard onboarding của họ.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/admin/onboarding")} style={btnPrimary}>
            Về dashboard onboarding
          </button>
          <button type="button" onClick={() => router.push("/admin/onboarding/new")} style={btnGhost}>
            Tạo lộ trình khác
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── small components ────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--ll-muted)", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{
      marginTop: 10,
      padding: "10px 12px",
      borderRadius: 8,
      background: "#fef2f2",
      border: "1px solid #fecaca",
      color: "#991b1b",
      fontSize: 13,
    }}>
      {text}
    </div>
  );
}

function FootHint() {
  return (
    <p style={{ fontSize: 12, color: "var(--ll-muted)", textAlign: "center", marginTop: 8 }}>
      💡 AI chỉ chọn doc đã có trong knowledge base. Nếu thiếu kiến thức, tạo doc mới ở /admin/docs trước.
    </p>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--ll-border)",
  borderRadius: 12,
  padding: 18,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  fontSize: 14,
  background: "white",
  boxSizing: "border-box",
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

const btnTinyDanger: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  background: "transparent",
  border: "1px solid #fca5a5",
  color: "#b91c1c",
  fontSize: 11,
  cursor: "pointer",
};
