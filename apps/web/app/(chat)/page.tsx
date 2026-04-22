import { Chat } from "@/components/chat";

export default function ChatPage() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "32px 24px",
        minHeight: "100vh",
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ color: "var(--ll-green-dark)", margin: 0 }}>
          Trợ lý AI nội bộ
        </h1>
        <p style={{ color: "var(--ll-muted)", marginTop: 8 }}>
          Hỏi bất cứ điều gì về quy trình, biểu mẫu, đối tác. Mọi câu trả lời
          đều kèm nguồn tài liệu.
        </p>
      </header>
      <Chat />
    </main>
  );
}
