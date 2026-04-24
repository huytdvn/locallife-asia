import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TrainingReport } from "@/components/training-report";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/ui";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function TrainingReportPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/training-report");
  const role = (session.role ?? "employee") as Role;
  if (role !== "admin" && role !== "lead") {
    redirect("/admin");
  }

  return (
    <PageShell maxWidth={1200}>
      <AppNav role={role} active="admin-report" />

      <header style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            color: "var(--ll-green-dark)",
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Báo cáo Training — Ai đã học gì
        </h1>
        <p
          style={{
            color: "var(--ll-muted)",
            marginTop: 6,
            maxWidth: 640,
            fontSize: 14,
          }}
        >
          Tiến độ tự học của từng nhân viên / đối tác trên các lộ trình đã xuất
          bản. Bao gồm % bài đọc + kết quả quiz cuối lộ trình.
        </p>
      </header>

      <TrainingReport />
    </PageShell>
  );
}
