import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { listAssignedFlowsForUser } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function MyFlowsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/onboarding/flows");
  const role = (session.role ?? "guest") as Role;

  const flows = await listAssignedFlowsForUser(session.user.email, role);

  return (
    <PageShell maxWidth={760}>
      <AppNav role={role} active="onboarding" />
      <SectionHeader
        title="Lộ trình onboarding của bạn 🌱"
        subtitle={
          flows.length === 0
            ? "Bạn chưa được giao lộ trình nào — đợi admin giao bài hoặc check lại sau."
            : `Bạn có ${flows.length} lộ trình đang chờ. Mỗi cái mất ~10–20 phút. Đi thôi!`
        }
      />

      {flows.length === 0 ? (
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
          🌿 Chưa có lộ trình nào ở đây.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {flows.map((f) => (
            <Link
              key={f.id}
              href={`/onboarding/flows/${f.id}`}
              style={{
                display: "block",
                background: "white",
                border: "1px solid var(--ll-border)",
                borderRadius: 12,
                padding: 18,
                textDecoration: "none",
                color: "var(--ll-ink)",
                transition: "border-color 120ms",
              }}
            >
              <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "var(--ll-green-dark)" }}>
                {f.title}
              </h3>
              {f.motto && (
                <p style={{ margin: "0 0 8px", fontSize: 13, fontStyle: "italic", color: "var(--ll-green-bright)" }}>
                  {f.motto}
                </p>
              )}
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                {f.step_count} bước · cần {f.pass_threshold}% để pass
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
