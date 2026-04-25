"use client";

import { useEffect, useRef, useState } from "react";
import { SuggestedQuestions } from "@/components/suggested-questions";
import { MdRenderer } from "@/components/md-renderer";

type CitationRef = {
  docId: string;
  path: string;
  heading: string;
  title: string;
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  refs?: CitationRef[];
  ts: number;
  streaming?: boolean;
};

interface ChatProps {
  starterQuestions?: string[];
  userName?: string;
}

export function Chat({ starterQuestions = [], userName = "" }: ChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStage, setToolStage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll to bottom when messages change or while streaming
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || loading) return;
    const userMsg: Msg = {
      role: "user",
      content: text,
      ts: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setToolStage(null);

    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Create assistant placeholder with streaming flag
    setMessages((m) => [
      ...m,
      { role: "assistant", content: "", ts: Date.now(), streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          throw new Error(
            "Phiên đăng nhập hết hạn — vui lòng reload và đăng nhập lại."
          );
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      for await (const ev of parseSSE(reader)) {
        if (ev.event === "delta") {
          const { text: delta } = ev.data as { text: string };
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            return [
              ...all.slice(0, -1),
              { ...last, content: last.content + delta },
            ];
          });
          setToolStage(null);
        } else if (ev.event === "citations") {
          const { citations, refs } = ev.data as {
            citations: string[];
            refs?: CitationRef[];
          };
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            return [
              ...all.slice(0, -1),
              { ...last, citations, refs, streaming: false },
            ];
          });
        } else if (ev.event === "tool_start") {
          const { name } = ev.data as { name: string };
          const label = TOOL_LABELS[name] ?? name;
          setToolStage(label);
        } else if (ev.event === "tool_result") {
          setToolStage(null);
        } else if (ev.event === "error") {
          const { message } = ev.data as { message: string };
          setMessages((all) => [
            ...all.slice(0, -1),
            {
              role: "assistant",
              content: `Có sự cố: ${message}. Bạn thử lại giúp mình nhé.`,
              ts: Date.now(),
            },
          ]);
        } else if (ev.event === "done") {
          setMessages((all) => {
            const last = all[all.length - 1];
            if (!last || last.role !== "assistant") return all;
            return [...all.slice(0, -1), { ...last, streaming: false }];
          });
          setToolStage(null);
        }
      }
    } catch (err) {
      setMessages((all) => {
        const last = all[all.length - 1];
        const base =
          last && last.role === "assistant" && !last.content
            ? all.slice(0, -1)
            : all;
        return [
          ...base,
          {
            role: "assistant",
            content: `Có sự cố: ${String(err)}. Bạn thử lại nhé.`,
            ts: Date.now(),
          },
        ];
      });
    } finally {
      setLoading(false);
      setToolStage(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter gửi; Shift+Enter xuống dòng
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-lg)",
        boxShadow: "var(--ll-shadow-sm)",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 220px)",
        minHeight: 500,
        overflow: "hidden",
      }}
    >
      {/* Scrollable messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 20px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background:
            "radial-gradient(600px 200px at 50% -50px, rgba(27,107,74,0.04), transparent 70%), white",
        }}
      >
        {messages.length === 0 ? (
          <EmptyState
            userName={userName}
            starter={starterQuestions}
            onPick={(q) => {
              setInput(q);
              inputRef.current?.focus();
            }}
          />
        ) : (
          messages.map((m, i) => (
            <MessageRow key={i} msg={m} userName={userName} />
          ))
        )}
        {toolStage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--ll-muted)",
              fontSize: 13,
              fontStyle: "italic",
              paddingLeft: 48,
            }}
          >
            <span className="ll-typing">
              <span />
              <span />
              <span />
            </span>
            {toolStage}
          </div>
        )}
      </div>

      {/* Input bar fixed bottom */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px 16px",
          borderTop: "1px solid var(--ll-border)",
          background: "var(--ll-surface-soft)",
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Hỏi mình bất cứ điều gì về Local Life..."
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid var(--ll-border)",
            fontFamily: "inherit",
            fontSize: 15,
            background: "white",
            resize: "none",
            minHeight: 42,
            maxHeight: 180,
            outline: "none",
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Gửi"
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background:
              loading || !input.trim()
                ? "var(--ll-muted)"
                : "var(--ll-green)",
            color: "white",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            fontWeight: 600,
            minWidth: 80,
            height: 42,
            boxShadow: "var(--ll-shadow-sm)",
          }}
        >
          {loading ? "…" : "Gửi"}
        </button>
      </form>
      <div
        style={{
          padding: "0 16px 10px",
          fontSize: 11,
          color: "var(--ll-muted)",
          background: "var(--ll-surface-soft)",
          textAlign: "right",
        }}
      >
        Enter để gửi · Shift+Enter xuống dòng
      </div>
    </div>
  );
}

function MessageRow({ msg, userName }: { msg: Msg; userName: string }) {
  const isUser = msg.role === "user";
  return (
    <div
      className="ll-bubble"
      style={{
        display: "flex",
        gap: 10,
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
    >
      <Avatar isUser={isUser} name={userName} />
      <div
        style={{
          maxWidth: "78%",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        <div
          style={{
            background: isUser ? "var(--ll-green)" : "var(--ll-surface-soft)",
            color: isUser ? "white" : "var(--ll-ink)",
            padding: "12px 16px",
            borderRadius: isUser
              ? "18px 18px 6px 18px"
              : "18px 18px 18px 6px",
            border: isUser ? "none" : "1px solid var(--ll-border)",
            boxShadow: "var(--ll-shadow-sm)",
            fontSize: 15,
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {isUser ? (
            <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
          ) : msg.content ? (
            <MdRenderer>{msg.content}</MdRenderer>
          ) : msg.streaming ? (
            <span className="ll-typing">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </div>
        {((msg.refs && msg.refs.length > 0) ||
          (msg.citations && msg.citations.length > 0)) && (
          <Citations items={msg.citations ?? []} refs={msg.refs ?? []} />
        )}
        <span style={{ fontSize: 11, color: "var(--ll-muted)" }}>
          {formatTime(msg.ts)}
        </span>
      </div>
    </div>
  );
}

function Avatar({ isUser, name }: { isUser: boolean; name: string }) {
  if (!isUser) {
    // Bé Tre mascot cho AI
    return (
      <div
        aria-label="Bé Tre"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--ll-green-mist)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          boxShadow: "var(--ll-shadow-sm)",
          overflow: "hidden",
          border: "2px solid var(--ll-green-bright)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mascot.webp"
          alt="Bé Tre"
          width={36}
          height={36}
          style={{ objectFit: "cover", objectPosition: "center 20%", width: "100%", height: "100%" }}
        />
      </div>
    );
  }
  const initials = userInitials(name);
  return (
    <div
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background:
          "linear-gradient(135deg, var(--ll-green) 0%, var(--ll-green-dark) 100%)",
        color: "white",
        fontSize: 13,
        fontWeight: 700,
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        boxShadow: "var(--ll-shadow-sm)",
      }}
    >
      {initials}
    </div>
  );
}

function Citations({
  items,
  refs,
}: {
  items: string[];
  refs: CitationRef[];
}) {
  // Dedup theo docId — refs sẽ có entry riêng cho mỗi heading
  const byDoc = new Map<string, CitationRef>();
  for (const r of refs) {
    if (!byDoc.has(r.docId)) byDoc.set(r.docId, r);
  }
  const uniqueDocs = [...byDoc.values()];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginTop: 6,
      }}
    >
      {/* Chip nguồn trích dẫn (citations theo heading) */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {items.map((c) => (
            <code
              key={c}
              style={{
                background: "var(--ll-green-soft)",
                color: "var(--ll-green-dark)",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                border: "1px solid rgba(13,84,48,0.15)",
              }}
              title={c}
            >
              {displayCitation(c)}
            </code>
          ))}
        </div>
      )}
      {/* File gốc dưới dạng link rõ ràng */}
      {uniqueDocs.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {uniqueDocs.map((r) => (
            <a
              key={r.docId}
              href={`/api/raw/${encodeURIComponent(r.docId)}`}
              target="_blank"
              rel="noreferrer"
              className="ll-file-link"
              title={r.title}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3 2.5A1.5 1.5 0 014.5 1H10l3 3v8.5A1.5 1.5 0 0111.5 14H4.5A1.5 1.5 0 013 12.5v-10z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M10 1v3h3" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              File gốc: {r.title.slice(0, 40)}
              {r.title.length > 40 && "…"}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  userName,
  starter,
  onPick,
}: {
  userName: string;
  starter: string[];
  onPick: (q: string) => void;
}) {
  const greeting = userName ? `, ${userName}` : "";
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          display: "grid",
          placeItems: "center",
          filter: "drop-shadow(0 6px 12px rgba(6,45,26,0.18))",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mascot.webp"
          alt="Bé Tre"
          width={96}
          height={96}
          style={{ width: "100%", height: "auto" }}
        />
      </div>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            color: "var(--ll-green-dark)",
            fontWeight: 600,
          }}
        >
          Bé Tre đây{greeting} 👋
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            color: "var(--ll-muted)",
            fontSize: 14,
            maxWidth: 480,
          }}
        >
          Trợ lý AI nội bộ Local Life. Cứ hỏi thoải mái — Bé kèm nguồn tài liệu
          đầy đủ để bạn tra lại khi cần.
        </p>
      </div>
      {starter.length > 0 && (
        <div
          style={{
            marginTop: 8,
            maxWidth: 560,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--ll-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontWeight: 600,
            }}
          >
            Gợi ý khởi đầu
          </div>
          <SuggestedQuestions questions={starter} onPick={onPick} />
        </div>
      )}
    </div>
  );
}

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
        // keep raw
      }
      yield { event: ev, data };
    }
  }
}

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Đang tra cứu tài liệu…",
  get_document: "Đang đọc chi tiết tài liệu…",
  draft_update: "Đang soạn đề xuất…",
  commit_update: "Đang lưu thay đổi…",
};

function userInitials(name: string): string {
  if (!name) return "B";
  const parts = name.split(/[\s@-]/).filter(Boolean);
  if (parts.length === 0) return "B";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function displayCitation(c: string): string {
  // Nén path dài: "inbox/01KPYXBCT47Y62ZNHC9AZWGJWG-quy-che-...md#heading"
  // → "quy-che...md#heading"
  const filePath = c.split("#")[0] ?? c;
  const heading = c.includes("#") ? "#" + c.split("#")[1] : "";
  const base = filePath.split("/").pop() ?? filePath;
  const cleaned = base.replace(/^01[A-Z0-9]{24}-/, "");
  return cleaned + heading;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
