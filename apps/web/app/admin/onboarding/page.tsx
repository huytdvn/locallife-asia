import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { query, isEnabled } from "@/lib/db";
import {
  computeFocusScore,
  isLow,
  aggregatePopupMetrics,
} from "@/lib/onboarding/focus-score";
import { isoWeekLabel, listPendingForAdmin } from "@/lib/onboarding/weekly-assignment";
import { listForUser } from "@/lib/onboarding/knowledge-task";
import { PageShell, SectionHeader } from "@/components/ui";
import { AppNav } from "@/components/app-nav";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const role = session.role ?? "guest";
  if (role !== "admin" && role !== "lead") {
    redirect("/dashboard");
  }

  const week = isoWeekLabel(new Date());
  const pendingAssignments = await listPendingForAdmin();
  const knowledgeTasks = await listForUser(session.user.email, role === "admin");

  // Team rows
  type TeamRow = {
    email: string;
    role: string;
    focusScore: number;
    isLow: boolean;
    popupResponseRate: number;
    humorAccuracy: number;
  };
  const teamRows: TeamRow[] = [];
  if (isEnabled()) {
    const accounts = await query<{ email: string; role: string }>(
      `SELECT r.email, r.role
       FROM roles r
       INNER JOIN account_extras ae ON ae.email = r.email
       WHERE ae.onboarding_bot_enabled = true
         AND r.disabled = false
         AND r.role IN ('employee','lead')
       ORDER BY r.role, r.email`
    );
    const now = new Date();
    const ws = new Date(now);
    const dn = (ws.getDay() + 6) % 7;
    ws.setHours(0, 0, 0, 0);
    ws.setDate(ws.getDate() - dn);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 7);
    for (const acc of accounts) {
      const m = await aggregatePopupMetrics(acc.email, ws, we);
      const score = computeFocusScore({
        assignmentsPassPct: 0,
        popupResponseRate: m.responseRate,
        humorAccuracy: m.humorAccuracy,
      });
      teamRows.push({
        email: acc.email,
        role: acc.role,
        focusScore: Math.round(score),
        isLow: isLow(score),
        popupResponseRate: m.responseRate,
        humorAccuracy: m.humorAccuracy,
      });
    }
  }

  return (
    <PageShell>
      <AppNav role={role} active="admin-onboarding" />

      <div style={{ maxWidth: 1024, margin: "0 auto", padding: "32px 16px" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Onboarding Dashboard</h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 14, marginBottom: 16 }}>
          Tuần <strong>{week}</strong> · {teamRows.length} nhân viên active.
        </p>
        {role === "admin" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <Link
              href="/admin/onboarding/new"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "var(--ll-green)",
                color: "white",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              ✨ Tạo lộ trình onboarding mới
            </Link>
            <Link
              href="/admin/training/new"
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                background: "white",
                color: "var(--ll-green-dark)",
                border: "1px solid var(--ll-green-dark)",
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              🎯 Tạo training mới
            </Link>
          </div>
        )}

        <SectionHeader title="📊 Team focus tuần này" subtitle="" />
        {teamRows.length === 0 ? (
          <p style={{ color: "var(--ll-muted)" }}>Chưa có account nào bật onboarding bot.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Focus</Th>
                <Th>Popup resp</Th>
                <Th>Humor</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {teamRows.map((r) => (
                <tr key={r.email}>
                  <Td>{r.email}</Td>
                  <Td>{r.role}</Td>
                  <Td style={{ color: r.isLow ? "var(--ll-terracotta)" : "var(--ll-green-dark)", fontWeight: 600 }}>
                    {r.focusScore}/100 {r.isLow && "🟡"}
                  </Td>
                  <Td>{Math.round(r.popupResponseRate * 100)}%</Td>
                  <Td>{Math.round(r.humorAccuracy * 100)}%</Td>
                  <Td>
                    <Link href={`/admin/onboarding/employee/${encodeURIComponent(r.email)}`} style={linkStyle}>
                      Drill-down
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <SectionHeader title="📋 Assignment chờ duyệt" subtitle="" />
        {pendingAssignments.length === 0 ? (
          <p style={{ color: "var(--ll-muted)" }}>Không có assignment nào chờ.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {pendingAssignments.map((a) => (
              <li key={a.id} style={liStyle}>
                <span><strong>{a.email}</strong> · {a.weekIso} · {a.trainingSlug}</span>
                <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                  status: {a.status} {a.lastScore !== null && `· score ${Math.round(a.lastScore * 100)}%`}
                </span>
              </li>
            ))}
          </ul>
        )}

        <SectionHeader title="📚 Knowledge task" subtitle="" />
        <div style={{ marginBottom: 12 }}>
          <Link
            href="/admin/onboarding/knowledge-tasks/new"
            style={{ ...linkStyle, background: "var(--ll-green)", color: "white", padding: "8px 14px" }}
          >
            + Tạo task mới
          </Link>
        </div>
        {knowledgeTasks.length === 0 ? (
          <p style={{ color: "var(--ll-muted)" }}>Chưa có knowledge task nào.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>ID</Th>
                <Th>Topic</Th>
                <Th>Audience</Th>
                <Th>Deadline</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {knowledgeTasks.map((t) => {
                const overdueClass = t.deadline < new Date() ? "var(--ll-terracotta)" : "var(--ll-ink)";
                return (
                  <tr key={t.id}>
                    <Td>{t.id}</Td>
                    <Td>{t.topic}</Td>
                    <Td>{t.audience.join(", ")}</Td>
                    <Td style={{ color: overdueClass }}>
                      {t.deadline.toLocaleDateString("vi-VN")}
                    </Td>
                    <Td>{t.status}</Td>
                    <Td>
                      <Link href={`/admin/onboarding/knowledge-tasks/${t.id}`} style={linkStyle}>
                        Mở
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </PageShell>
  );
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  background: "var(--ll-surface)",
  borderRadius: "var(--ll-radius-sm)",
  overflow: "hidden",
  marginBottom: 24,
  fontSize: 14,
};
const liStyle = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 14px",
  background: "var(--ll-surface)",
  border: "1px solid var(--ll-border)",
  borderRadius: "var(--ll-radius-sm)",
  marginBottom: 6,
  fontSize: 14,
};
const linkStyle = {
  color: "var(--ll-green-dark)",
  textDecoration: "none",
  borderRadius: "var(--ll-radius-sm)",
};

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "10px 14px",
        background: "var(--ll-green-mist)",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "var(--ll-muted)",
        fontWeight: 600,
        borderBottom: "1px solid var(--ll-border)",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--ll-border)",
        ...style,
      }}
    >
      {children}
    </td>
  );
}
