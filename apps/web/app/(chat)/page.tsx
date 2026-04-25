import Link from "next/link";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { DailyInsight } from "@/components/daily-insight";
import { auth } from "@/lib/auth";
import { computeStats, starterQuestions, timeGreeting } from "@/lib/stats";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await auth();
  const role = (session?.role ?? "guest") as Role;
  if (role === "host") redirect("/host");
  if (role === "lok") redirect("/lok");
  if (role === "guest") redirect("/public");

  const email = session?.user?.email ?? "";
  const stats = computeStats(role);
  const questions = starterQuestions(role);
  const displayName = humanName(email);

  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "16px 24px 24px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppNav role={role} active="home" />

      <div
        className="ll-grid-2col"
        style={{
          gap: 20,
          flex: 1,
          minHeight: 0,
        }}
      >
        <Chat starterQuestions={questions} userName={displayName} />

        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <div
            className="ll-card"
            style={{
              background: "var(--ll-grad-calm)",
              padding: 18,
            }}
          >
            <div style={{ fontSize: 12, color: "var(--ll-muted)", fontWeight: 500 }}>
              {timeGreeting()}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: "var(--ll-green-dark)",
                marginTop: 2,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--ll-muted)",
                marginTop: 2,
              }}
            >
              {stats.totalVisible} tài liệu bạn xem được · role{" "}
              <strong style={{ color: "var(--ll-ink)" }}>{role}</strong>
            </div>
          </div>
          <DailyInsight tip={stats.motivationalTip} />
          <section
            className="ll-card"
            style={{
              borderLeft: "3px solid var(--ll-green-bright)",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                color: "var(--ll-green-dark)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              Nhắc nhỏ
            </h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                color: "var(--ll-ink)",
                lineHeight: 1.7,
              }}
            >
              <li>
                Bé Tre chỉ trả lời từ {stats.totalVisible} tài liệu nội bộ —
                không bịa.
              </li>
              <li>
                Mọi câu trả lời kèm citation clickable — click mở tài liệu gốc.
              </li>
              <li>
                Muốn sửa/tạo doc mới? Nói với Bé: &quot;Soạn quy trình... và
                lưu vào...&quot;
              </li>
              <li>
                Cần tự học có hệ thống?{" "}
                <Link href="/training">Xem lộ trình training →</Link>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
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
