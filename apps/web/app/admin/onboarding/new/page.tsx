import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import type { Role } from "@/lib/rbac";
import { OnboardingBuilderWizard } from "./builder-wizard";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingNewPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/onboarding/new");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin") redirect("/admin/onboarding");

  return (
    <PageShell>
      <AppNav role={role} active="admin-onboarding" />
      <SectionHeader
        title="Cùng dựng một lộ trình onboarding 🌱"
        subtitle="Tả ý tưởng của bạn — hoặc bấm AI gợi ý nếu lười nghĩ. Tôi sẽ ghép thành lộ trình kèm tài liệu, highlight đoạn cần đọc, và câu hỏi pass/fail."
      />
      <OnboardingBuilderWizard adminEmail={session.user.email} />
    </PageShell>
  );
}
