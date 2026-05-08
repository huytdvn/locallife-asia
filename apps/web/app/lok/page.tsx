import { auth } from "@/lib/auth";
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
  const sessionRole = (session?.role ?? null) as Role | null;
  const isLoggedInForThisZone =
    sessionRole === "lok" || sessionRole === "lead" || sessionRole === "admin";
  const role: Role = isLoggedInForThisZone ? sessionRole : "lok";
  const email = session?.user?.email ?? "";
  const stats = computeStats(role);

  return (
    <ZonePortal
      zone="lok"
      brandName="Cổng LOK Partner"
      subtitle={
        isLoggedInForThisZone
          ? "Xin chào đối tác LOK!"
          : "Cổng LOK công khai"
      }
      accent="var(--ll-zone-lok)"
      starterQuestions={LOK_QUESTIONS}
      userName={email ? humanName(email) : "khách"}
      role={role}
      docCount={stats.totalVisible}
      isPublic={!isLoggedInForThisZone}
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
