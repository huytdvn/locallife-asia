import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { computeStats, timeGreeting } from "@/lib/stats";
import { getPathsForRole } from "@/lib/training";
import { getUserProgress } from "@/lib/training-progress";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";
import {
  PageShell,
  SectionHeader,
  StatCard,
  Hero,
  QuickActionCard,
  MotivationalQuote,
} from "@/components/ui";
import { DailyInsight } from "@/components/daily-insight";
import { TeamDirectory } from "@/components/team-directory";
import { AuditLog } from "@/components/audit-log";

export const dynamic = "force-dynamic";

const VALUES_QUOTES = [
  {
    q: "Chúng ta không bán phòng. Chúng ta mở cửa câu chuyện của một gia đình, một làng nghề, một vùng đất.",
    s: "Local Life Asia · Vision",
  },
  {
    q: "Địa phương trước. Mỗi quyết định về partner đều bắt đầu từ câu hỏi: ‘Điều này tốt cho cộng đồng không?’",
    s: "Giá trị cốt lõi",
  },
  {
    q: "Thật — không dàn dựng. Nếu đẹp không có thật thì không đưa lên. Nếu có thật mà chưa đẹp thì sửa.",
    s: "Giá trị cốt lõi · Authentic",
  },
  {
    q: "Gọn & rõ. Một câu quan trọng hơn mười câu. Một bảng rõ hơn ba đoạn văn.",
    s: "Giá trị cốt lõi · Lean",
  },
  {
    q: "AI khuếch đại con người, không thay thế. Khi AI làm tốt việc lặp, nhân sự có thời gian làm việc ấm.",
    s: "Giá trị cốt lõi · AI-amplified",
  },
];

function pickQuote() {
  const dayKey = Math.floor(Date.now() / 86400000);
  return VALUES_QUOTES[dayKey % VALUES_QUOTES.length];
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/dashboard");
  const email = session.user.email;
  const role = (session.role ?? "employee") as Role;
  const canAdmin = role === "admin" || role === "lead";
  const stats = computeStats(role);
  const trainingPaths = getPathsForRole(role);
  const myProgress = getUserProgress(email);
  const quote = pickQuote();

  const pathsWithProgress = trainingPaths.map((p) => {
    const prog = myProgress[p.slug];
    const total = p.total_steps ?? 0;
    const done = prog?.completed_steps.length ?? 0;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      ...p,
      done,
      total,
      pct,
      passedQuiz: !!prog?.quiz?.passed_at,
    };
  });
  const inProgress = pathsWithProgress.filter(
    (p) => p.pct > 0 && !p.passedQuiz
  );
  const completed = pathsWithProgress.filter((p) => p.passedQuiz).length;

  return (
    <PageShell>
      <AppNav role={role} active="dashboard" />

      <Hero
        greeting={timeGreeting()}
        name={humanName(email)}
        role={role}
        tagline={
          canAdmin
            ? `Hôm nay có ${stats.totalVisible} tài liệu trong knowledge base và ${trainingPaths.length} lộ trình training cho team.`
            : `Hôm nay có ${stats.totalVisible} tài liệu bạn tra cứu được. Mình là Bé Tre — hỏi gì cũng được, luôn kèm nguồn rõ ràng.`
        }
        metrics={[
          { label: "Tài liệu bạn xem được", value: String(stats.totalVisible) },
          { label: "Lộ trình dành cho bạn", value: String(trainingPaths.length) },
          ...(completed > 0
            ? [{ label: "Đã hoàn thành", value: String(completed) }]
            : []),
        ]}
      />

      <div
        className="ll-grid-2col"
        style={{
          gap: 20,
          marginTop: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <MotivationalQuote quote={quote.q} source={quote.s} />

          {inProgress.length > 0 && (
            <section>
              <SectionHeader
                title="Bạn đang học"
                subtitle="Tiếp tục từ chỗ còn dang dở"
                action={
                  <Link href="/training" style={{ fontSize: 13, fontWeight: 500 }}>
                    Tất cả lộ trình →
                  </Link>
                }
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inProgress.slice(0, 3).map((p) => (
                  <Link
                    key={p.slug}
                    href={`/training/${p.slug}`}
                    className="ll-card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 16,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{ fontWeight: 600, color: "var(--ll-green-dark)" }}
                      >
                        {p.title}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                        {p.done}/{p.total}
                      </span>
                    </div>
                    <div className="ll-bar">
                      <span style={{ width: `${p.pct}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                      {p.pct}% · tiếp tục học →
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeader
              title="Thư viện tri thức"
              subtitle={`${stats.totalVisible} tài liệu role ${role} xem được`}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              {stats.byDepartment.slice(0, 6).map((d) => (
                <StatCard key={d.dept} label={d.dept} value={d.count} />
              ))}
            </div>
          </section>

          <section>
            <SectionHeader title="Lối tắt nhanh" subtitle="Những chỗ bạn hay dùng" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 12,
              }}
            >
              <QuickActionCard
                href="/"
                title="Hỏi Bé Tre"
                desc="Tra cứu mọi câu hỏi với citation rõ ràng"
                accent="green"
                icon="💬"
              />
              <QuickActionCard
                href="/training"
                title="Lộ trình tự học"
                desc={`${trainingPaths.length} lộ trình dành cho role của bạn`}
                accent="orange"
                icon="🎯"
              />
              {canAdmin && (
                <>
                  <QuickActionCard
                    href="/admin/docs"
                    title="Quản lý tài liệu"
                    desc="Edit / deprecate / tạo mới — có AI assist"
                    accent="blue"
                    icon="📚"
                  />
                  <QuickActionCard
                    href="/admin/training-report"
                    title="Báo cáo Training"
                    desc="Ai học gì, quiz score, export CSV"
                    accent="purple"
                    icon="📊"
                  />
                </>
              )}
            </div>
          </section>

          {canAdmin && (
            <section className="ll-card">
              <SectionHeader title="Hoạt động gần đây" subtitle="Ai đã sửa gì, khi nào" />
              <AuditLog compact limit={10} />
            </section>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DailyInsight tip={stats.motivationalTip} />
          <TeamDirectory stats={stats} />
        </aside>
      </div>
    </PageShell>
  );
}

function humanName(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return "bạn";
  return local
    .replace(/[-_.]/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
