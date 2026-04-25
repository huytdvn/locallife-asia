import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ZonePortal } from "@/components/zone-portal";
import { computeStats } from "@/lib/stats";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const LOK_QUESTIONS = [
  "Chương trình LOK là gì?",
  "Quyền lợi và cam kết khi tham gia LOK?",
  "Quy trình đăng ký & xác nhận LOK?",
  "Tài liệu training vận hành LOK?",
  "Hợp đồng nguyên tắc LOK có gì?",
  "Cách báo cáo hoạt động LOK?",
];

export default async function LokPortal() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/lok");
  const role = (session.role ?? "guest") as Role;
  if (!["lok", "lead", "admin"].includes(role)) {
    redirect("/login?next=/lok&error=wrong_role");
  }
  const email = session.user.email;
  const stats = computeStats(role);

  return (
    <ZonePortal
      zone="lok"
      brandName="Cổng LOK Partner"
      subtitle="Xin chào đối tác LOK!"
      accent="var(--ll-zone-lok)"
      starterQuestions={LOK_QUESTIONS}
      userName={humanName(email)}
      role={role}
      docCount={stats.totalVisible}
    />
  );
}

function humanName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .replace(/[-_.]/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
