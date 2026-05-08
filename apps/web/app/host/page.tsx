import { auth } from "@/lib/auth";
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
  // Public access: anyone can land here without an account. Chat falls back
  // to role=host via publicAs hint, scoped to the host zone documents only.
  // If the visitor IS logged in but with a wrong role (e.g. "guest"), keep
  // them anonymous instead of bouncing to /login — they still get to chat.
  const sessionRole = (session?.role ?? null) as Role | null;
  const isLoggedInForThisZone =
    sessionRole === "host" || sessionRole === "lead" || sessionRole === "admin";
  const role: Role = isLoggedInForThisZone ? sessionRole : "host";
  const email = session?.user?.email ?? "";
  const stats = computeStats(role);

  return (
    <ZonePortal
      zone="host"
      brandName="Cổng Host"
      subtitle={isLoggedInForThisZone ? "Xin chào host!" : "Cổng Host công khai"}
      accent="var(--ll-zone-host)"
      starterQuestions={HOST_QUESTIONS}
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
