import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { BackLink, PageShell, SectionHeader } from "@/components/ui";
import { getOnboardingFlow } from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { FlowEditForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AdminFlowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/onboarding/flows-list");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin") redirect("/admin/onboarding/flows-list");
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) redirect("/admin/onboarding/flows-list");
  const flow = await getOnboardingFlow(flowId);
  if (!flow) redirect("/admin/onboarding/flows-list");

  return (
    <PageShell>
      <AppNav role={role} active="admin-onboarding" />
      <BackLink href="/admin/onboarding/flows-list" label="Quản lý lộ trình" />
      <SectionHeader title="Sửa lộ trình 📚" subtitle={flow.title} />
      <FlowEditForm initial={flow} />
    </PageShell>
  );
}
