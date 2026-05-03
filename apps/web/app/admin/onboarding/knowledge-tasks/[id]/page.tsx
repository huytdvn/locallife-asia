"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageShell } from "@/components/ui";

interface Task {
  id: string;          // pg BIGSERIAL serializes as string in JSON
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
  suggestedFrontMatter: Record<string, unknown>;
  markdown: string;
  instruction: string;
}

export default function KnowledgeTaskDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  async function genDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/admin/knowledge-tasks/${id}/draft`, {
        method: "POST",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? "Lỗi");
      setDraft(data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
          <a href="/admin/onboarding" style={{ color: "var(--ll-green-dark)" }}>← Quay lại dashboard</a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{task.topic}</h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 13, marginBottom: 16 }}>
          ID #{task.id} · audience {task.audience.join(", ")} · status <strong>{task.status}</strong> · deadline {new Date(task.deadline).toLocaleDateString("vi-VN")}
        </p>

        {task.notes && (
          <div style={{ background: "var(--ll-orange-soft)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            <strong>Ghi chú:</strong> {task.notes}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <button
            onClick={genDraft}
            disabled={busy}
            style={{
              background: "var(--ll-green)",
              color: "white",
              border: "none",
              padding: "10px 18px",
              borderRadius: "var(--ll-radius-sm)",
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "AI đang soạn…" : "🤖 AI soạn nháp"}
          </button>
        </div>

        {error && (
          <div style={{ color: "var(--ll-terracotta)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        {draft && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Nháp AI</h2>
            <div style={{ fontSize: 12, color: "var(--ll-muted)", marginBottom: 6 }}>
              Suggested slug: <code>{draft.suggestedSlug}</code>
            </div>
            <pre
              style={{
                background: "var(--ll-surface-soft)",
                border: "1px solid var(--ll-border)",
                borderRadius: 8,
                padding: 16,
                fontSize: 13,
                fontFamily: "ui-monospace, monospace",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                maxHeight: 480,
                overflowY: "auto",
              }}
            >
              {draft.markdown}
            </pre>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--ll-muted)" }}>
              {draft.instruction}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(draft.markdown)}
              style={{
                marginTop: 8,
                background: "var(--ll-orange-soft)",
                border: "1px solid var(--ll-sunlight)",
                padding: "6px 14px",
                borderRadius: "var(--ll-radius-sm)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              📋 Copy markdown
            </button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
