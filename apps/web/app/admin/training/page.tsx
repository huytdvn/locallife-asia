import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import {
  listTrainingQuizzes,
  quizAudienceAnalytics,
  type SavedTrainingQuiz,
  type QuizGroupAnalytics,
} from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { QuizDeleteButton } from "./quiz-delete-button";

export const dynamic = "force-dynamic";

export default async function AdminTrainingListPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/training");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin" && role !== "lead") redirect("/dashboard");
  const canDelete = role === "admin";

  const quizzes = await listTrainingQuizzes();
  // Lấy analytics song song cho từng quiz
  const analytics = await Promise.all(
    quizzes.map((q) => quizAudienceAnalytics(q.id, q.audience))
  );

  return (
    <PageShell>
      <AppNav role={role} active="admin" />
      <SectionHeader
        title="Training quiz — listing 🎯"
        subtitle={`${quizzes.length} quiz · phân nhóm theo audience · last online + tỉ lệ pass để bạn biết nudge ai`}
        action={
          role === "admin" ? (
            <Link
              href="/admin/training/new"
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--ll-green)",
                color: "white",
                fontWeight: 600,
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              ✨ Tạo quiz mới
            </Link>
          ) : null
        }
      />

      {quizzes.length === 0 ? (
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
          🌿 Chưa có quiz nào. Tạo quiz đầu tiên ở `/admin/training/new`.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {quizzes.map((q, i) => (
            <QuizCard key={q.id} quiz={q} groups={analytics[i]} canDelete={canDelete} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function QuizCard({
  quiz,
  groups,
  canDelete,
}: {
  quiz: SavedTrainingQuiz;
  groups: QuizGroupAnalytics[];
  canDelete: boolean;
}) {
  const totalUsers = groups.reduce((s, g) => s + g.active_users, 0);
  const totalAttempted = groups.reduce((s, g) => s + g.attempted, 0);
  const totalPassed = groups.reduce((s, g) => s + g.passed, 0);
  const completionPct = totalUsers > 0
    ? Math.round((totalAttempted / totalUsers) * 100)
    : 0;

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--ll-border)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "var(--ll-green-dark)" }}>
            {quiz.title}
          </h3>
          {quiz.motto && (
            <p style={{ margin: "0 0 6px", fontSize: 13, fontStyle: "italic", color: "var(--ll-green-bright)" }}>
              {quiz.motto}
            </p>
          )}
          <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
            {quiz.question_count} câu · pass {quiz.pass_threshold}% · format <strong>{quiz.format}</strong> ·
            {" "}{quiz.doc_paths.length} tài liệu nguồn
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 11,
              background: quiz.status === "published" ? "var(--ll-green-soft)" : "#f3f4f6",
              color: quiz.status === "published" ? "var(--ll-green-dark)" : "#6b7280",
              fontWeight: 600,
            }}
          >
            {quiz.status}
          </span>
          <Link
            href={`/training/quizzes/${quiz.id}`}
            style={pillStyle("white", "var(--ll-ink)", "var(--ll-border)")}
            title="Xem dưới góc nhìn user"
          >
            👁 Preview
          </Link>
          {canDelete && (
            <Link
              href={`/admin/training/${quiz.id}/edit`}
              style={pillStyle("var(--ll-green-soft)", "var(--ll-green-dark)", "var(--ll-green-bright)")}
              title="Sửa quiz (AI gen lại, đổi docs, đổi audience)"
            >
              ✏️ Sửa
            </Link>
          )}
          {canDelete && <QuizDeleteButton id={quiz.id} title={quiz.title} />}
        </div>
      </div>

      {/* Tổng thể */}
      <div
        style={{
          marginTop: 12,
          padding: 10,
          background: "var(--ll-surface-soft)",
          borderRadius: 8,
          fontSize: 12,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <span>👥 <strong>{totalUsers}</strong> user trong audience</span>
        <span>✏️ <strong>{totalAttempted}</strong> đã làm ({completionPct}%)</span>
        <span>✓ <strong>{totalPassed}</strong> đã pass</span>
      </div>

      {/* Per-audience breakdown */}
      <div style={{ marginTop: 10 }}>
        <strong style={{ fontSize: 12, color: "var(--ll-muted)" }}>📦 Package theo nhóm nhân viên</strong>
        <div style={{ display: "grid", gap: 6, marginTop: 6, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {groups.map((g) => (
            <div
              key={g.audience_role}
              style={{
                padding: 10,
                background: "var(--ll-surface-soft)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span
                  className="ll-badge"
                  style={{
                    background: `var(--ll-role-${g.audience_role})`,
                    color: "#111",
                    fontSize: 10,
                  }}
                >
                  {g.audience_role}
                </span>
                <span style={{ color: "var(--ll-muted)" }}>
                  {g.active_users === 0
                    ? "Không có user"
                    : `${g.passed}/${g.active_users} pass`}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
                {g.most_recent_online ? (
                  <>🟢 Mới online: {timeAgo(g.most_recent_online)}</>
                ) : (
                  <>⚪ Chưa có hoạt động 30d</>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--ll-muted)" }}>
                {g.typical_online_hour !== null
                  ? <>⏰ Hay online quanh: {Math.round(g.typical_online_hour)}h</>
                  : <>⏰ Chưa đủ data giờ giấc</>}
              </div>
              {g.active_users > 0 && g.attempted < g.active_users && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "#fff7ed",
                    color: "#c07600",
                    fontSize: 11,
                    border: "1px solid #fdba74",
                  }}
                  title="Auto-suggestion: nhóm này còn người chưa làm. Pick lúc giờ thường online để nudge."
                >
                  💡 Còn {g.active_users - g.attempted} chưa làm — nudge lúc {g.typical_online_hour !== null ? `${Math.round(g.typical_online_hour)}h` : "giờ làm việc"} có khả năng cao họ thấy
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function pillStyle(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 11,
    background: bg,
    color,
    border: `1px solid ${border}`,
    textDecoration: "none",
    fontWeight: 500,
    whiteSpace: "nowrap",
    lineHeight: 1.4,
    display: "inline-block",
  };
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "vài giây trước";
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h trước`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd} ngày trước`;
  return d.toISOString().slice(0, 10);
}
