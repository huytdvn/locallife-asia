import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
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
  if (!session?.user?.email) redirect("/login?next=/public");
  const role = (session.role ?? "guest") as Role;
  const email = session.user.email;
  const stats = computeStats(role);

  return (
    <ZonePortal
      zone="public"
      brandName="Trợ lý Local Life"
      subtitle="Chào bạn đến Local Life Asia"
      accent="var(--ll-zone-public)"
      starterQuestions={PUBLIC_QUESTIONS}
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
