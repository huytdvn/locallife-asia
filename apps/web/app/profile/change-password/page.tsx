import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { hasPassword, passwordMustChange } from "@/lib/password";
import type { Role } from "@/lib/rbac";
import { ChangePasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/profile/change-password");
  const role = (session.role ?? "guest") as Role;
  const email = session.user.email;
  const requireOld = await hasPassword(email);
  const must = await passwordMustChange(email);

  return (
    <PageShell>
      <AppNav role={role} active="dashboard" />
      <SectionHeader
        title={must ? "Đổi mật khẩu (bắt buộc)" : "Đổi mật khẩu"}
        subtitle={
          must
            ? "Lần đầu đăng nhập — vui lòng đổi sang mật khẩu của riêng bạn trước khi tiếp tục."
            : "Cập nhật mật khẩu cho tài khoản của bạn. Tối thiểu 10 ký tự, có chữ hoa, chữ thường và số."
        }
      />
      <ChangePasswordForm requireOld={requireOld} forced={must} email={email} />
    </PageShell>
  );
}
