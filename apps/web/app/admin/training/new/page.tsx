import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import type { Role } from "@/lib/rbac";
import { TrainingBuilderWizard } from "./builder-wizard";

export const dynamic = "force-dynamic";

export default async function AdminTrainingNewPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/training/new");
  const role = (session.role ?? "guest") as Role;
  if (role !== "admin") redirect("/admin/training-report");

  return (
    <PageShell maxWidth={920}>
      <AppNav role={role} active="admin" />
      <SectionHeader
        title="Tạo training mới 🎯"
        subtitle="Chọn vài tài liệu, AI sẽ ghép thành quiz tự chấm. Tài liệu chưa duyệt cho audience đích sẽ có cảnh báo — bạn click duyệt nhanh ngay tại đây."
      />
      <TrainingBuilderWizard adminEmail={session.user.email} />
    </PageShell>
  );
}
