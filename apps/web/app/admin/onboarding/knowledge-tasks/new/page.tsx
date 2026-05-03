"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell, SectionHeader } from "@/components/ui";

export default function NewKnowledgeTaskPage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState<string[]>(["employee"]);
  const [level, setLevel] = useState<string>("");
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [levelBased, setLevelBased] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleAudience(a: string) {
    setAudience((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/admin/knowledge-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          audience,
          level: level || undefined,
          deadlineDays,
          levelBased,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? "Lỗi");
      router.push(`/admin/onboarding/knowledge-tasks/${data.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>Tạo knowledge task</h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 14, marginBottom: 24 }}>
          AI sẽ soạn nháp markdown theo chủ đề; admin review + commit qua existing flow.
        </p>

        <Field label="Chủ đề / topic">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="vd: Quy trình xử lý hoàn tiền cấp lead"
            style={inputStyle}
          />
        </Field>

        <Field label="Audience (đọc được)">
          {(["host", "employee", "lead", "admin"] as const).map((a) => (
            <label key={a} style={{ marginRight: 16, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={audience.includes(a)}
                onChange={() => toggleAudience(a)}
                style={{ marginRight: 4 }}
              />
              {a}
            </label>
          ))}
        </Field>

        <Field label="Cấp độ (optional)">
          <select value={level} onChange={(e) => setLevel(e.target.value)} style={inputStyle}>
            <option value="">— bất kỳ —</option>
            <option value="entry">entry</option>
            <option value="mid">mid</option>
            <option value="senior">senior</option>
          </select>
        </Field>

        <Field label="Deadline (ngày kể từ hôm nay)">
          <input
            type="number"
            value={deadlineDays}
            min={1}
            max={30}
            onChange={(e) => setDeadlineDays(Number(e.target.value))}
            style={inputStyle}
          />
        </Field>

        <Field label="Level-based (gen 2-3 file theo cấp độ)">
          <label style={{ fontSize: 14 }}>
            <input
              type="checkbox"
              checked={levelBased}
              onChange={(e) => setLevelBased(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Sinh phiên bản entry / mid / senior riêng
          </label>
        </Field>

        <Field label="Ghi chú thêm cho AI (optional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
            placeholder="vd: cần đề cập timeline 5-10-30 ngày, link tới policy refund..."
          />
        </Field>

        {error && (
          <div style={{ color: "var(--ll-terracotta)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={busy || topic.trim().length < 3 || audience.length === 0}
          style={{
            background: "var(--ll-green)",
            color: "white",
            border: "none",
            padding: "10px 18px",
            borderRadius: "var(--ll-radius-sm)",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: topic.trim().length < 3 || audience.length === 0 ? 0.5 : 1,
          }}
        >
          {busy ? "Đang tạo…" : "Tạo task"}
        </button>
      </div>
    </PageShell>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--ll-border)",
  borderRadius: "var(--ll-radius-sm)",
  fontSize: 14,
  background: "white",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--ll-ink-soft)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}
