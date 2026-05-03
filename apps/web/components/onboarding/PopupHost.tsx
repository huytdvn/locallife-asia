"use client";

import { useEffect, useState, useCallback } from "react";
import { PopupCard } from "./PopupCard";

interface PendingPopup {
  id: number;
  type: "motivation" | "check_in" | "humor";
  content: string | { q: string; options: { A: string; B: string; C: string; D: string } };
  sentAt: string | null;
}

/**
 * Polling-based popup host. Mỗi 30s GET /api/onboarding/popups/pending,
 * render popup mới nhất chưa response. Đơn giản để v1 không cần WS;
 * upgrade sang WS khi có need (R6).
 */
export function PopupHost() {
  const [pending, setPending] = useState<PendingPopup[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/popups/pending");
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        setPending(data.data);
      }
    } catch {
      // silent — best effort
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const top = pending[0];
  if (!top) return null;

  return (
    <PopupCard
      key={top.id}
      id={top.id}
      type={top.type}
      content={top.content}
      sentAt={top.sentAt}
      onResolved={() => {
        setPending((prev) => prev.filter((p) => p.id !== top.id));
        // refresh sau 1.5s để pickup popup tiếp theo nếu có
        setTimeout(refresh, 1500);
      }}
    />
  );
}
