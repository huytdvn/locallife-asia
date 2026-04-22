"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; citations?: string[] };

// Phase 1 sẽ thay thế bằng streaming SSE thật tới /api/chat.
// Ở Phase 0 chỉ là skeleton UI để thống nhất layout và design tokens.
export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.content ?? "(chưa có câu trả lời)",
          citations: data.citations,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Lỗi: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--ll-border)",
        borderRadius: 12,
        background: "white",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ color: "var(--ll-muted)", fontSize: 14 }}>
            Ví dụ: "Làm sao xin nghỉ phép?", "Quy trình onboarding host mới?",
            "Tiêu chuẩn homestay gồm gì?"
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background: m.role === "user" ? "var(--ll-green)" : "var(--ll-cream)",
              color: m.role === "user" ? "white" : "var(--ll-ink)",
              padding: "10px 14px",
              borderRadius: 10,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content}
            {m.citations && m.citations.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  opacity: 0.7,
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  paddingTop: 6,
                }}
              >
                Nguồn: {m.citations.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Hỏi điều gì đó..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--ll-border)",
            fontFamily: "inherit",
            fontSize: 15,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "var(--ll-green)",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "..." : "Gửi"}
        </button>
      </form>
    </div>
  );
}
