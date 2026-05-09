"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function QuizDeleteButton({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function del() {
    if (!confirm(`Xoá quiz "${title}"?\nThao tác KHÔNG THỂ HOÀN TÁC — sẽ xoá luôn các attempt.`)) return;
    startTransition(async () => {
      const r = await fetch(`/api/admin/training/quizzes/${id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.error ?? `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={pending}
      style={{
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        background: "white",
        color: "#b91c1c",
        border: "1px solid #fca5a5",
        cursor: pending ? "wait" : "pointer",
        fontWeight: 500,
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
      title="Xoá quiz vĩnh viễn"
    >
      🗑 Xoá
    </button>
  );
}
