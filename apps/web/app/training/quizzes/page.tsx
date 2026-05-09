import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { listQuizzesForRole } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MyQuizzesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/training/quizzes");
  const role = (session.role ?? "guest") as Role;

  const quizzes = await listQuizzesForRole(role);

  return (
    <PageShell>
      <AppNav role={role} active="training" />
      <SectionHeader
        title="Quiz training 🎯"
        subtitle={
          quizzes.length === 0
            ? "Chưa có quiz nào dành cho role của bạn — quay lại sau."
            : `${quizzes.length} quiz để học hôm nay. Pick 1 cái thấy hợp.`
        }
      />

      {quizzes.length === 0 ? (
        <div
          style={{
            background: "var(--ll-surface)",
            border: "1px dashed var(--ll-border)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
            color: "var(--ll-muted)",
          }}
        >
          🌿 Chưa có quiz nào.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {quizzes.map((q) => (
            <Link
              key={q.id}
              href={`/training/quizzes/${q.id}`}
              style={{
                display: "block",
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 12,
                padding: 18,
                textDecoration: "none",
                color: "var(--ll-ink)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "var(--ll-green-dark)" }}>
                  {q.title}
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 12,
                    background: "var(--ll-green-soft)",
                    color: "var(--ll-green-dark)",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {q.format === "quiz" ? "🎯 Quiz" : q.format === "reading" ? "📖 Đọc" : "🃏 Flashcard"}
                </span>
              </div>
              {q.motto && (
                <p style={{ margin: "0 0 8px", fontSize: 13, fontStyle: "italic", color: "var(--ll-green-bright)" }}>
                  {q.motto}
                </p>
              )}
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                {q.question_count} câu · pass {q.pass_threshold}% · từ {q.doc_paths.length} tài liệu
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
