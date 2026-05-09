"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

interface Flow {
  id: number;
  title: string;
  motto: string | null;
  pass_threshold: number;
  status: "draft" | "published" | "archived";
  created_by: string;
  created_at: string;
  step_count: number;
}

export function FlowsListClient({
  initialFlows,
  canDelete,
}: {
  initialFlows: Flow[];
  canDelete: boolean;
}) {
  const [flows, setFlows] = useState(initialFlows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function del(id: number, title: string) {
    if (!confirm(`Xoá lộ trình "${title}"?\nThao tác KHÔNG THỂ HOÀN TÁC — sẽ xoá luôn các attempt + assignment.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await fetch(`/api/admin/onboarding/flows/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        return;
      }
      setFlows((cur) => cur.filter((f) => f.id !== id));
    });
  }

  if (flows.length === 0) {
    return (
      <div
        style={{
          background: "var(--ll-surface)",
          border: "1px dashed var(--ll-border)",
          borderRadius: 12,
          padding: 28,
          textAlign: "center",
          color: "var(--ll-muted)",
        }}
      >
        🌿 Chưa có lộ trình nào. Tạo lộ trình đầu tiên ở /admin/onboarding/new.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "#fef2f2", border: "1px solid #fecaca",
          color: "#991b1b", fontSize: 13,
        }}>
          {error}
        </div>
      )}
      {flows.map((f) => (
        <div
          key={f.id}
          style={{
            background: "white",
            border: "1px solid var(--ll-border)",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "var(--ll-green-dark)" }}>
              {f.title}
            </h3>
            {f.motto && (
              <p style={{ margin: "0 0 4px", fontSize: 12, fontStyle: "italic", color: "var(--ll-green-bright)" }}>
                {f.motto}
              </p>
            )}
            <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
              {f.step_count} bước · pass {f.pass_threshold}% · {f.created_by} · {f.created_at.slice(0, 10)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
            <span style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11,
              background: f.status === "published" ? "var(--ll-green-soft)" : "#f3f4f6",
              color: f.status === "published" ? "var(--ll-green-dark)" : "#6b7280",
              fontWeight: 600,
            }}>
              {f.status}
            </span>
            <Link
              href={`/onboarding/flows/${f.id}`}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 11,
                background: "white", color: "var(--ll-ink)",
                border: "1px solid var(--ll-border)", textDecoration: "none",
              }}
            >
              👁 Preview
            </Link>
            {canDelete && (
              <button
                type="button"
                onClick={() => del(f.id, f.title)}
                disabled={pending}
                style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11,
                  background: "transparent", color: "#b91c1c",
                  border: "1px solid #fca5a5", cursor: "pointer",
                }}
              >
                Xoá
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
