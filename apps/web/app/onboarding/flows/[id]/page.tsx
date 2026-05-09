import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { BackLink, PageShell, SectionHeader } from "@/components/ui";
import {
  getOnboardingFlow,
  userIsAssignedToFlow,
} from "@/lib/admin-builders/persistence";
import type { Role } from "@/lib/rbac";
import { FlowTaker } from "./taker";

export const dynamic = "force-dynamic";

export default async function FlowTakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const flowId = Number(id);
  if (!Number.isFinite(flowId)) redirect("/onboarding/flows");
  if (!session?.user?.email) redirect(`/login?next=/onboarding/flows/${flowId}`);
  const role = (session.role ?? "guest") as Role;

  if (role !== "admin" && role !== "lead") {
    const ok = await userIsAssignedToFlow(session.user.email, role, flowId);
    if (!ok) redirect("/onboarding/flows");
  }

  const flow = await getOnboardingFlow(flowId);
  if (!flow) redirect("/onboarding/flows");
  if (flow.status !== "published" && role !== "admin") {
    redirect("/onboarding/flows");
  }

  return (
    <PageShell>
      <AppNav role={role} active="onboarding" />
      <BackLink href="/onboarding/flows" label="Lộ trình của bạn" />
      <SectionHeader
        title={flow.title}
        subtitle={flow.motto ?? undefined}
      />
      <FlowTaker flow={flow} />
    </PageShell>
  );
}
