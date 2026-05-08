import { auth } from "@/lib/auth";
import { ZonePortal } from "@/components/zone-portal";
import { computeStats } from "@/lib/stats";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const PUBLIC_QUESTIONS = [
  "Local Life Asia là gì?",
  "Làm thế nào để đặt trải nghiệm?",
  "Chính sách huỷ / hoàn tiền ra sao?",
  "Điều khoản sử dụng dịch vụ?",
  "Cách liên hệ hỗ trợ khách hàng?",
];

export default async function PublicPortal() {
  const session = await auth();
  const sessionRole = (session?.role ?? null) as Role | null;
  const role: Role = sessionRole ?? "guest";
  const email = session?.user?.email ?? "";
  const stats = computeStats(role);
  const isPublic = !session?.user?.email;

  return (
    <ZonePortal
      zone="public"
      brandName="Trợ lý Local Life"
      subtitle="Chào bạn đến Local Life Asia"
      accent="var(--ll-zone-public)"
      starterQuestions={PUBLIC_QUESTIONS}
      userName={email ? humanName(email) : "khách"}
      role={role}
      docCount={stats.totalVisible}
      isPublic={isPublic}
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
