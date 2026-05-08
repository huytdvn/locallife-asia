import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { otpRequiredForRole } from "@/lib/otp";
import type { Role } from "@/lib/rbac";
import { OtpEnrollWizard } from "./enroll-wizard";

export const dynamic = "force-dynamic";

export default async function OtpSetupPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/profile/otp-setup");
  const role = (session.role ?? "guest") as Role;
  if (!otpRequiredForRole(role)) redirect("/profile");

  return (
    <PageShell maxWidth={560}>
      <AppNav role={role} active="dashboard" />
      <SectionHeader
        title="Kích hoạt xác thực 2 yếu tố"
        subtitle="Quét QR bằng app Authenticator → nhập 6 số để xác nhận"
      />
      <OtpEnrollWizard />
    </PageShell>
  );
}
