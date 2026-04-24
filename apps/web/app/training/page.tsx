import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPathsForRole } from "@/lib/training";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_INTRO: Record<string, string> = {
  employee: "Các lộ trình tự học dành cho nhân viên Local Life Asia.",
  lead: "Lộ trình cho lead + toàn bộ lộ trình nhân viên.",
  admin: "Toàn bộ lộ trình training trong hệ thống.",
  host: "Lộ trình onboarding dành cho host homestay / trải nghiệm.",
  lok: "Lộ trình cho đối tác chương trình LOK.",
  guest: "Giới thiệu nhanh về Local Life Asia dành cho khách.",
};

export default async function TrainingListPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/training");
  const role = (session.role ?? "guest") as Role;
  const paths = getPathsForRole(role);

  return (
    <PageShell maxWidth={1120}>
      <AppNav role={role} active="training" />

      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            color: "var(--ll-green-dark)",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Lộ trình tự học
        </h1>
        <p
          style={{
            color: "var(--ll-muted)",
            marginTop: 6,
            maxWidth: 640,
            fontSize: 14,
          }}
        >
          {ROLE_INTRO[role] ?? "Các lộ trình tự học phù hợp với vai trò của bạn."}
        </p>
      </header>

      {paths.length === 0 ? (
        <div
          className="ll-card"
          style={{ textAlign: "center", color: "var(--ll-muted)" }}
        >
          Chưa có lộ trình training cho role <code>{role}</code>. Yêu cầu HR bổ
          sung qua chat.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {paths.map((p) => (
            <Link
              key={p.slug}
              href={`/training/${p.slug}`}
              style={{ textDecoration: "none" }}
            >
              <div
                className="ll-card ll-anim-in"
                style={{
                  borderLeft: "4px solid var(--ll-green-bright)",
                  transition: "all 120ms var(--ll-ease)",
                  cursor: "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 17,
                    color: "var(--ll-green-dark)",
                  }}
                >
                  {p.title}
                </h2>
                {p.subtitle && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--ll-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {p.subtitle}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    marginTop: "auto",
                    paddingTop: 10,
                    borderTop: "1px solid var(--ll-border)",
                  }}
                >
                  {p.duration && (
                    <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                      ⏱ {p.duration}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                    📚 {p.total_steps ?? 0} bài
                  </span>
                  {p.accessible_steps !== undefined &&
                    p.accessible_steps < (p.total_steps ?? 0) && (
                      <span
                        style={{ fontSize: 12, color: "var(--ll-orange)" }}
                      >
                        ⚠ {p.accessible_steps}/{p.total_steps} bạn truy cập được
                      </span>
                    )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
