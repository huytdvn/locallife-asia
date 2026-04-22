"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; citations?: string[] };

type SSEEvent = { event: string; data: unknown };

async function* parseSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let ev = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      const rawData = dataLines.join("\n");
      let data: unknown = rawData;
      try {
        data = JSON.parse(rawData);
      } catch {
        // keep rawData as fallback
      }
      yield { event: ev, data };
    }
  }
}

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    const historyForServer = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForServer }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      for await (const ev of parseSSE(reader)) {
        if (ev.event === "delta") {
          const { text } = ev.data as { text: string };
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            const updated = { ...last, content: last.content + text };
            return [...all.slice(0, -1), updated];
          });
        } else if (ev.event === "citations") {
          const { citations } = ev.data as { citations: string[] };
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            return [...all.slice(0, -1), { ...last, citations }];
          });
        } else if (ev.event === "tool_start") {
          const { name } = ev.data as { name: string };
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            const prefix = last.content ? last.content + "\n" : "";
            return [
              ...all.slice(0, -1),
              { ...last, content: `${prefix}› đang tra cứu (${name})...\n` },
            ];
          });
        } else if (ev.event === "error") {
          const { message } = ev.data as { message: string };
          setMessages((all) => [
            ...all,
            { role: "assistant", content: `Lỗi: ${message}` },
          ]);
        }
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Lỗi: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
      abortRef.current = null;
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
              background:
                m.role === "user" ? "var(--ll-green)" : "var(--ll-cream)",
              color: m.role === "user" ? "white" : "var(--ll-ink)",
              padding: "10px 14px",
              borderRadius: 10,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content || (loading && i === messages.length - 1 ? "…" : "")}
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
