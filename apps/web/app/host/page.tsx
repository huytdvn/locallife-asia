import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ZonePortal } from "@/components/zone-portal";
import { computeStats } from "@/lib/stats";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const HOST_QUESTIONS = [
  "Quy trình onboarding host mới?",
  "Tiêu chuẩn chất lượng homestay?",
  "Chính sách huỷ booking áp dụng cho host?",
  "Chính sách thưởng phạt dựa trên đánh giá?",
  "Quy trình xử lý khiếu nại khách?",
  "Hồ sơ cần chuẩn bị khi đăng ký host?",
];

export default async function HostPortal() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/host");
  const role = (session.role ?? "guest") as Role;
  if (!["host", "lead", "admin"].includes(role)) {
    redirect("/login?next=/host&error=wrong_role");
  }
  const email = session.user.email;
  const stats = computeStats(role);

  return (
    <ZonePortal
      zone="host"
      brandName="Cổng Host"
      subtitle="Xin chào host!"
      accent="var(--ll-zone-host)"
      starterQuestions={HOST_QUESTIONS}
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
