import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { BackLink, PageShell, SectionHeader } from "@/components/ui";
import { listOnboardingFlows } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { FlowsListClient } from "./flows-list-client";

export const dynamic = "force-dynamic";

export default async function AdminFlowsListPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/onboarding/flows-list");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin" && role !== "lead") redirect("/dashboard");

  const flows = await listOnboardingFlows();

  return (
    <PageShell>
      <AppNav role={role} active="admin-onboarding" />
      <BackLink href="/admin/onboarding" label="Trung tâm đào tạo" />
      <SectionHeader
        title="Quản lý lộ trình 📚"
        subtitle={`${flows.length} lộ trình. Click vào để xem dưới góc nhìn user, hoặc xoá nếu không còn dùng.`}
        action={
          role === "admin" ? (
            <Link
              href="/admin/onboarding/new"
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
              ✨ Tạo lộ trình mới
            </Link>
          ) : null
        }
      />
      <FlowsListClient initialFlows={flows} canDelete={role === "admin"} />
    </PageShell>
  );
}
