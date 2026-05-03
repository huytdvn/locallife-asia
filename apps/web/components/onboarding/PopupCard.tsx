"use client";

import { useState, useEffect, useCallback } from "react";

type Variant = "motivation" | "check_in" | "humor";

interface HumorContent {
  q: string;
  options: { A: string; B: string; C: string; D: string };
}

interface PopupProps {
  id: number;
  type: Variant;
  /** string for motivation/check_in, HumorContent JSON for humor */
  content: string | HumorContent;
  sentAt: string | null;
  onResolved?: () => void;
}

const PALETTE: Record<Variant, { bg: string; border: string; chip: string; label: string }> = {
  motivation: {
    bg: "linear-gradient(135deg, var(--ll-green-mist) 0%, var(--ll-orange-soft) 100%)",
    border: "var(--ll-green-soft)",
    chip: "var(--ll-green)",
    label: "Tia năng lượng",
  },
  check_in: {
    bg: "linear-gradient(135deg, #fef9c3 0%, #fff7ed 100%)",
    border: "var(--ll-sunlight)",
    chip: "#d97706",
    label: "Hỏi nhanh",
  },
  humor: {
    bg: "linear-gradient(135deg, #fce7f3 0%, #fff7ed 100%)",
    border: "#fbcfe8",
    chip: "#db2777",
    label: "Đố vui",
  },
};

/**
 * Anti-stress popup card (FR-027..FR-029):
 * - Không full-screen, không block scroll, không spinner trắng.
 * - Esc + click-outside dismiss.
 * - Auto-minimize chip sau 30s nếu chưa response.
 * - Microcopy thân tình, button copy động viên ("Mình trả lời", "Để lúc khác").
 */
export function PopupCard({ id, type, content, sentAt, onResolved }: PopupProps) {
  const [minimized, setMinimized] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [humorChoice, setHumorChoice] = useState<"A"|"B"|"C"|"D"|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ correct?: boolean | null } | null>(null);

  const palette = PALETTE[type];

  // Auto-minimize 30s
  useEffect(() => {
    if (resolved) return;
    const t = setTimeout(() => setMinimized(true), 30_000);
    return () => clearTimeout(t);
  }, [resolved]);

  // Esc to dismiss
  useEffect(() => {
    if (minimized || resolved) return;
    const handler = async (e: KeyboardEvent) => {
      if (e.key === "Escape") setMinimized(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [minimized, resolved]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/onboarding/popups/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responseText: responseText.trim() || undefined,
          humorAnswer: humorChoice ?? undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? "Lỗi không xác định");
      setResolved({ correct: data.data?.humorCorrect });
      setTimeout(() => onResolved?.(), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [id, responseText, humorChoice, onResolved]);

  const dismiss = useCallback(async () => {
    try {
      await fetch(`/api/onboarding/popups/${id}/dismiss`, { method: "POST" });
    } catch {
      // best-effort, không hiện error cho dismiss
    }
    onResolved?.();
  }, [id, onResolved]);

  if (minimized && !resolved) {
    return (
      <button
        onClick={() => setMinimized(false)}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          padding: "8px 14px",
          borderRadius: 999,
          background: palette.chip,
          color: "white",
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "var(--ll-shadow-md)",
          cursor: "pointer",
          zIndex: 60,
        }}
        aria-label="Mở lại popup"
      >
        💬 {palette.label} — bấm để mở
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label={palette.label}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        maxWidth: 420,
        width: "calc(100vw - 48px)",
        maxHeight: "30vh",
        overflowY: "auto",
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: "var(--ll-radius-lg)",
        padding: 20,
        boxShadow: "var(--ll-shadow-lg)",
        zIndex: 60,
        animation: "popupSlideIn 240ms var(--ll-ease)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: palette.chip,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {palette.label}
        </span>
        <button
          onClick={() => setMinimized(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ll-muted)",
            fontSize: 13,
          }}
          aria-label="Thu nhỏ"
        >
          —
        </button>
      </div>

      {resolved ? (
        <div style={{ color: "var(--ll-ink)", fontSize: 14, lineHeight: 1.5 }}>
          {type === "humor" && resolved.correct === true && "🎉 Chính xác! Đẹp lắm."}
          {type === "humor" && resolved.correct === false && "Chưa đúng, nhưng cảm ơn anh/chị đã thử nhé!"}
          {type !== "humor" && "Cảm ơn anh/chị đã chia sẻ. Mình ghi nhận rồi."}
        </div>
      ) : type === "humor" ? (
        <HumorBody
          content={content as HumorContent}
          choice={humorChoice}
          setChoice={setHumorChoice}
          onSubmit={submit}
          onDismiss={dismiss}
          submitting={submitting}
          error={error}
        />
      ) : (
        <TextBody
          message={content as string}
          responseText={responseText}
          setResponseText={setResponseText}
          onSubmit={submit}
          onDismiss={dismiss}
          submitting={submitting}
          error={error}
          isMotivation={type === "motivation"}
        />
      )}
    </div>
  );
}

function TextBody({
  message,
  responseText,
  setResponseText,
  onSubmit,
  onDismiss,
  submitting,
  error,
  isMotivation,
}: {
  message: string;
  responseText: string;
  setResponseText: (s: string) => void;
  onSubmit: () => void;
  onDismiss: () => void;
  submitting: boolean;
  error: string | null;
  isMotivation: boolean;
}) {
  return (
    <>
      <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ll-ink)", margin: "0 0 12px" }}>
        {message}
      </p>
      {!isMotivation && (
        <textarea
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          placeholder="Trả lời 1 dòng (hoặc bỏ qua)…"
          rows={2}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid var(--ll-border)",
            borderRadius: "var(--ll-radius-sm)",
            fontSize: 14,
            fontFamily: "inherit",
            resize: "none",
            marginBottom: 12,
            background: "white",
          }}
        />
      )}
      {error && (
        <div style={{ color: "var(--ll-terracotta)", fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onDismiss}
          disabled={submitting}
          style={{
            background: "none",
            border: "none",
            color: "var(--ll-muted)",
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 10px",
          }}
        >
          Để lúc khác
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting}
          style={{
            background: "var(--ll-green)",
            color: "white",
            border: "none",
            borderRadius: "var(--ll-radius-sm)",
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: submitting ? "wait" : "pointer",
            transition: "transform 120ms var(--ll-ease)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {submitting ? "Đang gửi..." : isMotivation ? "Cảm ơn em" : "Mình trả lời"}
        </button>
      </div>
    </>
  );
}

function HumorBody({
  content,
  choice,
  setChoice,
  onSubmit,
  onDismiss,
  submitting,
  error,
}: {
  content: HumorContent;
  choice: "A"|"B"|"C"|"D"|null;
  setChoice: (c: "A"|"B"|"C"|"D") => void;
  onSubmit: () => void;
  onDismiss: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const optionEntries: Array<["A"|"B"|"C"|"D", string]> = [
    ["A", content.options.A],
    ["B", content.options.B],
    ["C", content.options.C],
    ["D", content.options.D],
  ];
  return (
    <>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: "var(--ll-ink)", margin: "0 0 10px" }}>
        {content.q}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {optionEntries.map(([key, text]) => (
          <button
            key={key}
            onClick={() => setChoice(key)}
            style={{
              textAlign: "left",
              background: choice === key ? "var(--ll-green-soft)" : "white",
              border: `1px solid ${choice === key ? "var(--ll-green)" : "var(--ll-border)"}`,
              borderRadius: "var(--ll-radius-sm)",
              padding: "8px 12px",
              fontSize: 13,
              cursor: "pointer",
              transition: "all 120ms var(--ll-ease)",
            }}
          >
            <strong style={{ marginRight: 8, color: "var(--ll-green-dark)" }}>{key}.</strong>
            {text}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ color: "var(--ll-terracotta)", fontSize: 12, marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onDismiss}
          disabled={submitting}
          style={{
            background: "none",
            border: "none",
            color: "var(--ll-muted)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Bỏ qua
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || !choice}
          style={{
            background: choice ? "var(--ll-green)" : "var(--ll-border)",
            color: "white",
            border: "none",
            borderRadius: "var(--ll-radius-sm)",
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            cursor: choice && !submitting ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Đang gửi..." : "Đáp án của tôi"}
        </button>
      </div>
    </>
  );
}
