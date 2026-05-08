"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "pick" | "review" | "done";

interface DocMeta {
  id: string;
  title: string;
  audience: string[];
  status: string;
  path: string;
  tags: string[];
}

interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer_idx: number;
  explanation: string;
}

interface QuizDraft {
  title: string;
  motto: string;
  intro: string;
  pass_threshold: number;
  questions: QuizQuestion[];
}

const ALL_ROLES = ["employee", "lead", "admin", "host", "lok", "guest"] as const;
type R = (typeof ALL_ROLES)[number];
const INTERNAL: R[] = ["employee", "lead", "admin"];

export function TrainingBuilderWizard({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pick");

  // Pick phase
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]); // paths
  const [audience, setAudience] = useState<R[]>(["employee"]);
  const [format, setFormat] = useState<"quiz" | "reading" | "flashcard">("quiz");
  const [customInstr, setCustomInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Review phase
  const [draft, setDraft] = useState<QuizDraft | null>(null);

  useEffect(() => {
    fetch("/api/admin/docs")
      .then((r) => r.json())
      .then((j) => setDocs(Array.isArray(j.docs) ? j.docs : []))
      .catch(() => setDocs([]));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs.slice(0, 50);
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.path.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [docs, search]);

  const pickedDocs = useMemo(
    () => picked.map((p) => docs.find((d) => d.path === p)).filter((d): d is DocMeta => Boolean(d)),
    [picked, docs]
  );

  /** Audience (đích) có được "duyệt" cho tất cả docs trong picked? */
  function approvalStatus(doc: DocMeta): {
    okFor: R[];
    missingInternal: R[];
    needsZoneFix: R[];
  } {
    const zone = zoneOfPath(doc.path);
    const okFor: R[] = [];
    const missingInternal: R[] = [];
    const needsZoneFix: R[] = [];
    for (const a of audience) {
      const inAudience = doc.audience.includes(a);
      const zoneOk =
        a === "admin" || a === "lead" || a === "employee"
          ? zone === "internal"
          : a === "host" ? zone === "host" || zone === "public"
          : a === "lok" ? zone === "lok" || zone === "public"
          : zone === "public";
      if (inAudience && zoneOk) okFor.push(a);
      else if (INTERNAL.includes(a) && !inAudience && zone === "internal") missingInternal.push(a);
      else needsZoneFix.push(a);
    }
    return { okFor, missingInternal, needsZoneFix };
  }

  async function quickApprove(docPath: string, addAudience: R[]) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/docs/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: docPath, audience: addAudience }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      // refresh docs list
      const rr = await fetch("/api/admin/docs");
      const jj = await rr.json();
      setDocs(Array.isArray(jj.docs) ? jj.docs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (picked.length === 0) {
      setError("Chọn ít nhất 1 tài liệu");
      return;
    }
    if (audience.length === 0) {
      setError("Chọn ít nhất 1 audience đích");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/training/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docPaths: picked,
          audience,
          format,
          customInstruction: customInstr.trim() || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDraft(j.draft as QuizDraft);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/training/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          audience,
          docPaths: picked,
          format,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);

      const pubR = await fetch(`/api/admin/training/quizzes/${j.id}/publish`, {
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

  function updateQuestion(idx: number, patch: Partial<QuizQuestion>) {
    if (!draft) return;
    const qs = draft.questions.slice();
    qs[idx] = { ...qs[idx], ...patch };
    setDraft({ ...draft, questions: qs });
  }

  function removeQuestion(idx: number) {
    if (!draft) return;
    const qs = draft.questions.slice();
    qs.splice(idx, 1);
    setDraft({ ...draft, questions: qs });
  }

  // ─── render ────────────────────────────────────────────────────────

  if (phase === "pick") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={cardStyle}>
          <Row label="Audience đích (ai sẽ học quiz này)">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_ROLES.map((r) => {
                const on = audience.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAudience((cur) =>
                      cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]
                    )}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      fontSize: 13,
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

          <Row label="Format training">
            <div style={{ display: "flex", gap: 6 }}>
              {(["quiz", "reading", "flashcard"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    border: format === f ? "2px solid var(--ll-green-dark)" : "1px solid var(--ll-border)",
                    background: format === f ? "var(--ll-green-soft)" : "white",
                    fontWeight: format === f ? 600 : 500,
                  }}
                >
                  {f === "quiz" ? "🎯 Quiz tự chấm" : f === "reading" ? "📖 Đọc + câu mở" : "🃏 Flashcard"}
                </button>
              ))}
            </div>
          </Row>

          <Row label="Yêu cầu riêng cho AI (tuỳ chọn)">
            <input
              value={customInstr}
              onChange={(e) => setCustomInstr(e.target.value)}
              placeholder="vd: focus vào tình huống xử lý booking, không hỏi lý thuyết suông"
              style={inputStyle}
            />
          </Row>
        </div>

        <div className="ll-card" style={cardStyle}>
          <Row label={`Chọn tài liệu (đã pick: ${picked.length})`}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tiêu đề / path / tag…"
              style={inputStyle}
            />
          </Row>

          {pickedDocs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>Đã chọn:</strong>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                {pickedDocs.map((d) => {
                  const status = approvalStatus(d);
                  return (
                    <div key={d.path} style={{
                      padding: 10,
                      background: "var(--ll-surface-soft)",
                      borderRadius: 8,
                      fontSize: 13,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <strong>{d.title}</strong>
                        <button
                          type="button"
                          onClick={() => setPicked((cur) => cur.filter((p) => p !== d.path))}
                          style={btnTinyDanger}
                        >
                          Bỏ
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ll-muted)", marginTop: 2 }}>
                        {d.path}
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {status.okFor.map((r) => (
                          <span key={`ok-${r}`} style={badgeOk}>✓ {r}</span>
                        ))}
                        {status.missingInternal.map((r) => (
                          <button
                            key={`miss-${r}`}
                            type="button"
                            onClick={() => quickApprove(d.path, [r])}
                            disabled={busy}
                            style={badgeWarnButton}
                            title="Click để duyệt audience cho doc này"
                          >
                            ⚡ Duyệt {r}
                          </button>
                        ))}
                        {status.needsZoneFix.map((r) => (
                          <span key={`zone-${r}`} style={badgeZoneWarn} title="Doc đang ở zone khác — admin cần move file">
                            ⚠ {r} (cần move zone)
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{
            maxHeight: 300,
            overflowY: "auto",
            border: "1px solid var(--ll-border)",
            borderRadius: 8,
            padding: 4,
          }}>
            {filtered.map((d) => {
              const isPicked = picked.includes(d.path);
              return (
                <div
                  key={d.path}
                  onClick={() => setPicked((cur) =>
                    cur.includes(d.path) ? cur.filter((p) => p !== d.path) : [...cur, d.path]
                  )}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    cursor: "pointer",
                    background: isPicked ? "var(--ll-green-soft)" : "transparent",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <input type="checkbox" checked={isPicked} readOnly />
                  <span>{d.title}</span>
                  <span style={{ fontSize: 11, color: "var(--ll-muted)", marginLeft: "auto" }}>
                    {d.path}
                  </span>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p style={{ padding: 12, fontSize: 13, color: "var(--ll-muted)", margin: 0 }}>
                Không tìm thấy tài liệu nào khớp.
              </p>
            )}
          </div>
        </div>

        {error && <ErrorBox text={error} />}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={generate}
            disabled={busy || picked.length === 0 || audience.length === 0}
            style={btnPrimary}
          >
            ✨ {busy ? "Đang dựng quiz…" : "Tạo quiz từ tài liệu đã chọn"}
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--ll-muted)", textAlign: "center" }}>
          💡 Created by: {adminEmail}
        </p>
      </div>
    );
  }

  if (phase === "review" && draft) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ll-card" style={cardStyle}>
          <Row label="Tiêu đề quiz">
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
          <Row label="Intro (markdown)">
            <textarea
              value={draft.intro}
              onChange={(e) => setDraft({ ...draft, intro: e.target.value })}
              rows={3}
              style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
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

        {draft.questions.map((q, i) => (
          <div key={q.id} className="ll-card" style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Câu {i + 1}</strong>
              <button type="button" onClick={() => removeQuestion(i)} style={btnTinyDanger}>
                Xoá câu
              </button>
            </div>
            <input
              value={q.prompt}
              onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
              style={inputStyle}
              placeholder="Câu hỏi"
            />
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {q.choices.map((c, j) => (
                <label key={j} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name={`ans-${q.id}`}
                    checked={q.answer_idx === j}
                    onChange={() => updateQuestion(i, { answer_idx: j })}
                  />
                  <input
                    value={c}
                    onChange={(e) => {
                      const choices = q.choices.slice();
                      choices[j] = e.target.value;
                      updateQuestion(i, { choices });
                    }}
                    style={{ ...inputStyle, padding: "6px 10px" }}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 11, color: "var(--ll-muted)" }}>
                Giải thích (hiện sau khi user chấm)
              </label>
              <textarea
                value={q.explanation}
                onChange={(e) => updateQuestion(i, { explanation: e.target.value })}
                rows={2}
                style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
              />
            </div>
          </div>
        ))}

        {error && <ErrorBox text={error} />}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={generate} disabled={busy} style={btnGhost}>
            🔄 Sinh lại
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || draft.questions.length === 0}
            style={btnPrimary}
          >
            💾 {busy ? "Đang lưu…" : "Lưu & publish"}
          </button>
          <button type="button" onClick={() => setPhase("pick")} style={btnGhost}>
            ← Sửa nguồn
          </button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="ll-card" style={{ ...cardStyle, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
        <h2 style={{ margin: "0 0 8px", color: "var(--ll-green-dark)" }}>
          Quiz đã sẵn sàng!
        </h2>
        <p style={{ color: "var(--ll-muted)", fontSize: 13, marginBottom: 14 }}>
          User trong audience đã chọn sẽ thấy quiz này trong /training.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/admin/training-report")} style={btnPrimary}>
            Về training report
          </button>
          <button type="button" onClick={() => router.push("/admin/training/new")} style={btnGhost}>
            Tạo quiz khác
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── helpers ─────────────────────────────────────────────────────────

function zoneOfPath(p: string): "internal" | "host" | "lok" | "public" {
  const prefix = p.split("/")[0] ?? "";
  if (prefix === "host") return "host";
  if (prefix === "lok") return "lok";
  if (prefix === "public") return "public";
  return "internal";
}

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

const badgeOk: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 12,
  background: "var(--ll-green-soft)",
  color: "var(--ll-green-dark)",
  fontSize: 11,
  fontWeight: 600,
};

const badgeWarnButton: React.CSSProperties = {
  padding: "2px 10px",
  borderRadius: 12,
  background: "#fff7ed",
  color: "#c07600",
  border: "1px solid #fdba74",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const badgeZoneWarn: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 12,
  background: "#fef3c7",
  color: "#92400e",
  fontSize: 11,
  fontWeight: 500,
};
