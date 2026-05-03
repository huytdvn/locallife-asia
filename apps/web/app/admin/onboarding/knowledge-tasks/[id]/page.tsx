"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/ui";

interface Task {
  id: string;
  topic: string;
  audience: string[];
  level: string | null;
  deadline: string;
  levelBased: boolean;
  status: string;
  prUrl: string | null;
  notes: string | null;
  createdAt: string;
}

interface DraftResult {
  taskId: number;
  suggestedSlug: string;
  suggestedFrontMatter: {
    title: string;
    audience: string[];
    sensitivity: "public" | "internal" | "restricted";
    tags: string[];
    status: string;
    owner: string;
  };
  markdown: string;
  instruction: string;
}

interface SaveResult {
  taskId: number;
  docId: string;
  path: string;
  prUrl: string | null;
  previewUrl: string;
  spawnedAssignments?: {
    count: number;
    emails: string[];
    weekIso: string;
  };
}

const ZONES = ["public", "host", "lok", "internal"] as const;
const DEPT_BY_ZONE: Record<string, string[]> = {
  internal: [
    "00-company",
    "10-hr",
    "20-operations",
    "30-product",
    "40-partners",
    "50-finance",
  ],
  public: ["about", "policy", "guides"],
  host: ["faq", "guides", "policy"],
  lok: ["program", "guides"],
};

export default function KnowledgeTaskDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState<"draft" | "save" | "regen" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SaveResult | null>(null);

  // Editable state
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState<"public" | "internal" | "restricted">(
    "internal"
  );
  const [tags, setTags] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [zone, setZone] = useState<string>("internal");
  const [dept, setDept] = useState<string>("00-company");
  const [slug, setSlug] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/onboarding/admin/knowledge-tasks`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          const t = (d.data as Task[]).find((x) => String(x.id) === id);
          if (t) setTask(t);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-fill editable from draft
  useEffect(() => {
    if (!draft) return;
    setTitle(draft.suggestedFrontMatter.title);
    setAudience(draft.suggestedFrontMatter.audience);
    setSensitivity(draft.suggestedFrontMatter.sensitivity);
    setTags(draft.suggestedFrontMatter.tags.join(", "));
    setBodyMd(draft.markdown);
    setSlug(draft.suggestedSlug);

    // Smart zone/dept guess
    const aud = draft.suggestedFrontMatter.audience;
    if (aud.includes("host")) {
      setZone("host");
      setDept("faq");
    } else if (aud.includes("lok")) {
      setZone("lok");
      setDept("program");
    } else {
      setZone("internal");
      // Heuristic by topic
      const topic = (task?.topic ?? "").toLowerCase();
      if (topic.includes("hoàn tiền") || topic.includes("refund") || topic.includes("payment"))
        setDept("20-operations");
      else if (topic.includes("hr") || topic.includes("nhân sự")) setDept("10-hr");
      else if (topic.includes("sản phẩm") || topic.includes("homestay")) setDept("30-product");
      else if (topic.includes("đối tác") || topic.includes("partner")) setDept("40-partners");
      else if (topic.includes("commission") || topic.includes("giá")) setDept("50-finance");
      else setDept("20-operations");
    }
  }, [draft, task?.topic]);

  const computedPath = useMemo(
    () => `${zone}/${dept}/${slug || "untitled"}.md`,
    [zone, dept, slug]
  );

  function toggleAudience(a: string) {
    setAudience((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }

  async function genDraft(regen = false) {
    setBusy(regen ? "regen" : "draft");
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/admin/knowledge-tasks/${id}/draft`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? "Lỗi");
      setDraft(data.data);
      setSaved(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveAsDraft() {
    if (!bodyMd.trim() || !title.trim() || audience.length === 0) {
      setError("Cần điền title + ít nhất 1 audience + body");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/admin/knowledge-tasks/${id}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: computedPath,
          fm: {
            title,
            audience,
            sensitivity,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          },
          body: bodyMd,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? "Lỗi lưu");
      setSaved(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <PageShell>
        <div style={{ padding: 32, color: "var(--ll-muted)" }}>Đang tải…</div>
      </PageShell>
    );
  }
  if (!task) {
    return (
      <PageShell>
        <div style={{ padding: 32 }}>
          <h1>Không tìm thấy task #{id}</h1>
          <p style={{ color: "var(--ll-muted)" }}>
            Có thể anh không có quyền xem (lead chỉ thấy task của mình tạo), hoặc task đã xoá.
          </p>
          <a href="/admin/onboarding" style={{ color: "var(--ll-green-dark)" }}>
            ← Quay lại dashboard
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "24px 16px 48px" }}>
        <a
          href="/admin/onboarding"
          style={{ color: "var(--ll-muted)", fontSize: 13, textDecoration: "none" }}
        >
          ← Onboarding admin
        </a>
        <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>{task.topic}</h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 13, marginBottom: 16 }}>
          ID #{task.id} · audience {task.audience.join(", ")} · status{" "}
          <strong>{saved ? "pr_open ✓" : task.status}</strong> · deadline{" "}
          {new Date(task.deadline).toLocaleDateString("vi-VN")}
        </p>

        {task.notes && (
          <div
            style={{
              background: "var(--ll-orange-soft)",
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            <strong>Ghi chú:</strong> {task.notes}
          </div>
        )}

        {!draft && (
          <button onClick={() => genDraft()} disabled={busy === "draft"} style={primaryBtn}>
            {busy === "draft" ? "AI đang soạn…" : "🤖 AI soạn nháp"}
          </button>
        )}

        {error && (
          <div style={{ color: "var(--ll-terracotta)", fontSize: 13, marginTop: 12 }}>{error}</div>
        )}

        {saved && <SuccessPanel saved={saved} />}

        {draft && !saved && (
          <ActionPanel
            title={title}
            setTitle={setTitle}
            audience={audience}
            toggleAudience={toggleAudience}
            sensitivity={sensitivity}
            setSensitivity={setSensitivity}
            tags={tags}
            setTags={setTags}
            zone={zone}
            setZone={setZone}
            dept={dept}
            setDept={setDept}
            slug={slug}
            setSlug={setSlug}
            computedPath={computedPath}
            bodyMd={bodyMd}
            setBodyMd={setBodyMd}
            busy={busy}
            onSave={saveAsDraft}
            onRegen={() => genDraft(true)}
            onCopy={() => navigator.clipboard.writeText(bodyMd)}
          />
        )}
      </div>
    </PageShell>
  );
}

function SuccessPanel({ saved }: { saved: SaveResult }) {
  const spawn = saved.spawnedAssignments;
  return (
    <div
      style={{
        background: "var(--ll-green-mist)",
        border: "1px solid var(--ll-green-soft)",
        borderRadius: "var(--ll-radius-md)",
        padding: 20,
        marginTop: 16,
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "var(--ll-green-dark)" }}>
        ✓ Đã tạo khoá training thành công
      </h2>
      <p style={{ fontSize: 14, color: "var(--ll-ink)", margin: "0 0 12px" }}>
        Doc đã commit vào git tier-1, knowledge_task chuyển status{" "}
        <code>assigned</code>. Mọi nhân viên audience-match nhận assignment
        tuần này — họ sẽ thấy ngay khi mở <code>/onboarding</code>.
      </p>
      <div
        style={{
          background: "white",
          border: "1px solid var(--ll-green-soft)",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>
            <strong>📚 Doc:</strong> <code>{saved.path}</code>{" "}
            <span style={{ color: "var(--ll-muted)" }}>
              (id <code>{saved.docId}</code>)
            </span>
          </div>
          {saved.prUrl && (
            <div>
              <strong>🔗 Commit:</strong>{" "}
              <a
                href={saved.prUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--ll-green-dark)" }}
              >
                {saved.prUrl.split("/").slice(-1)[0].slice(0, 8)} ↗
              </a>
            </div>
          )}
          {spawn && (
            <div>
              <strong>🎯 Đã giao cho:</strong>{" "}
              {spawn.count > 0 ? (
                <>
                  <strong style={{ color: "var(--ll-green-dark)" }}>
                    {spawn.count} nhân viên
                  </strong>{" "}
                  · tuần <code>{spawn.weekIso}</code>
                  {spawn.emails.length > 0 && spawn.emails.length <= 8 && (
                    <div style={{ marginTop: 4, fontSize: 12, color: "var(--ll-muted)" }}>
                      {spawn.emails.join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: "var(--ll-muted)" }}>
                  0 — chưa có account nào audience-match đã bật onboarding bot
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={saved.previewUrl} style={{ ...primaryBtn, textDecoration: "none" }}>
          Duyệt doc → approved
        </a>
        <a href="/admin/onboarding" style={secondaryBtn}>
          Về dashboard
        </a>
      </div>
      <p style={{ fontSize: 12, color: "var(--ll-muted)", marginTop: 12, marginBottom: 0 }}>
        💡 Doc đang ở status=<code>draft</code>. Sau khi approve trong /admin/docs,
        retrieval (chat AI) cũng truy cập được nội dung.
      </p>
    </div>
  );
}

function ActionPanel(props: {
  title: string;
  setTitle: (v: string) => void;
  audience: string[];
  toggleAudience: (a: string) => void;
  sensitivity: "public" | "internal" | "restricted";
  setSensitivity: (v: "public" | "internal" | "restricted") => void;
  tags: string;
  setTags: (v: string) => void;
  zone: string;
  setZone: (v: string) => void;
  dept: string;
  setDept: (v: string) => void;
  slug: string;
  setSlug: (v: string) => void;
  computedPath: string;
  bodyMd: string;
  setBodyMd: (v: string) => void;
  busy: "draft" | "save" | "regen" | null;
  onSave: () => void;
  onRegen: () => void;
  onCopy: () => void;
}) {
  const depts = DEPT_BY_ZONE[props.zone] ?? [];
  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>📝 Review & lưu</h2>
      <p style={{ color: "var(--ll-muted)", fontSize: 13, margin: "0 0 16px" }}>
        AI đã soạn xong. Sửa metadata + nội dung bên dưới rồi chọn 1 trong 3 hành động:
        <strong> Lưu vào knowledge</strong> (đi qua git tier-1, xuất hiện trong /admin/docs với
        status <code>draft</code>), <strong>Regen</strong> (AI soạn lại), hoặc{" "}
        <strong>Copy</strong> (clipboard).
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Field label="Title">
          <input
            value={props.title}
            onChange={(e) => props.setTitle(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Sensitivity">
          <select
            value={props.sensitivity}
            onChange={(e) =>
              props.setSensitivity(e.target.value as "public" | "internal" | "restricted")
            }
            style={inputStyle}
          >
            <option value="public">public</option>
            <option value="internal">internal</option>
            <option value="restricted">restricted</option>
          </select>
        </Field>
      </div>

      <Field label="Audience">
        {(["host", "employee", "lead", "admin"] as const).map((a) => (
          <label key={a} style={{ marginRight: 16, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={props.audience.includes(a)}
              onChange={() => props.toggleAudience(a)}
              style={{ marginRight: 4 }}
            />
            {a}
          </label>
        ))}
      </Field>

      <Field label="Tags (cách nhau dấu phẩy)">
        <input
          value={props.tags}
          onChange={(e) => props.setTags(e.target.value)}
          placeholder="onboarding, refund, sop..."
          style={inputStyle}
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 200px 1fr",
          gap: 8,
          alignItems: "end",
          marginBottom: 12,
        }}
      >
        <Field label="Zone">
          <select
            value={props.zone}
            onChange={(e) => {
              props.setZone(e.target.value);
              const newDepts = DEPT_BY_ZONE[e.target.value] ?? [];
              if (newDepts.length > 0) props.setDept(newDepts[0]);
            }}
            style={inputStyle}
          >
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select
            value={props.dept}
            onChange={(e) => props.setDept(e.target.value)}
            style={inputStyle}
          >
            {depts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Slug">
          <input
            value={props.slug}
            onChange={(e) => props.setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))}
            placeholder="vd: refund-policy"
            style={inputStyle}
          />
        </Field>
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--ll-muted)",
          marginTop: -8,
          marginBottom: 16,
          padding: "0 4px",
        }}
      >
        Path sẽ lưu: <code style={{ color: "var(--ll-green-dark)" }}>knowledge/{props.computedPath}</code>
      </div>

      <Field label="Nội dung markdown (sửa được)">
        <textarea
          value={props.bodyMd}
          onChange={(e) => props.setBodyMd(e.target.value)}
          rows={20}
          style={{
            ...inputStyle,
            fontFamily: "ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 1.6,
            resize: "vertical",
          }}
        />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button
          onClick={props.onSave}
          disabled={props.busy === "save"}
          style={primaryBtn}
        >
          {props.busy === "save" ? "Đang lưu…" : "💾 Lưu vào knowledge (draft)"}
        </button>
        <button
          onClick={props.onRegen}
          disabled={props.busy === "regen"}
          style={secondaryBtn}
        >
          {props.busy === "regen" ? "Regen…" : "🔄 AI soạn lại"}
        </button>
        <button onClick={props.onCopy} style={secondaryBtn}>
          📋 Copy markdown
        </button>
      </div>
      <p style={{ fontSize: 12, color: "var(--ll-muted)", marginTop: 8 }}>
        Sau khi lưu: doc xuất hiện trong /admin/docs với status=draft. Admin duyệt thành approved
        ở đó. Knowledge_task chuyển status <code>pr_open</code>.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--ll-border)",
  borderRadius: "var(--ll-radius-sm)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "white",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--ll-green)",
  color: "white",
  border: "none",
  padding: "10px 18px",
  borderRadius: "var(--ll-radius-sm)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

const secondaryBtn: React.CSSProperties = {
  background: "white",
  color: "var(--ll-ink)",
  border: "1px solid var(--ll-border)",
  padding: "10px 18px",
  borderRadius: "var(--ll-radius-sm)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label
        style={{
          display: "block",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ll-ink-soft)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
