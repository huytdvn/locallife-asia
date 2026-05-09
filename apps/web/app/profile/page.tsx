import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { getOtpStatus, otpRequiredForRole } from "@/lib/otp";
import { hasPassword } from "@/lib/password";
import { isInternal, type Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/profile");
  const role = (session.role ?? "guest") as Role;
  const email = session.user.email;
  const otpApplies = otpRequiredForRole(role);
  const otp = otpApplies ? await getOtpStatus(email) : null;
  const userHasPw = await hasPassword(email);

  return (
    <PageShell>
      <AppNav role={role} active="dashboard" />
      <SectionHeader title="Hồ sơ của bạn" subtitle={email} />

      <section
        style={{
          background: "var(--ll-surface)",
          border: "1px solid var(--ll-border)",
          borderRadius: "var(--ll-radius-md)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Vai trò</h3>
        <span
          className="ll-badge"
          style={{
            background: `var(--ll-role-${role})`,
            color: "#111",
          }}
        >
          {role}
        </span>
        {!isInternal(role) && (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--ll-muted)" }}>
            Tài khoản external (host/lok/guest) — không yêu cầu OTP.
          </p>
        )}
      </section>

      <section
        style={{
          background: "var(--ll-surface)",
          border: "1px solid var(--ll-border)",
          borderRadius: "var(--ll-radius-md)",
          padding: 20,
          marginBottom: 16,
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>🔑 Mật khẩu</h3>
        {userHasPw ? (
          <>
            <p style={{ fontSize: 13, color: "var(--ll-muted)", margin: "0 0 12px" }}>
              Tài khoản đang dùng mật khẩu để đăng nhập. Đổi định kỳ để bảo mật.
            </p>
            <Link
              href="/profile/change-password"
              style={{
                display: "inline-block",
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--ll-border)",
                fontSize: 13,
                color: "var(--ll-ink)",
                textDecoration: "none",
              }}
            >
              Đổi mật khẩu
            </Link>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--ll-muted)", margin: 0 }}>
            Tài khoản đang đăng nhập qua Google SSO — không có mật khẩu cục bộ.
          </p>
        )}
      </section>

      {otpApplies && otp && (
        <section
          style={{
            background: "var(--ll-surface)",
            border: "1px solid var(--ll-border)",
            borderRadius: "var(--ll-radius-md)",
            padding: 20,
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>
            Xác thực 2 yếu tố (TOTP)
          </h3>
          {otp.enrolled && !otp.isExpired ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  className="ll-badge"
                  style={{
                    background: "var(--ll-green-soft)",
                    color: "var(--ll-green-dark)",
                  }}
                >
                  ✓ Đã kích hoạt
                </span>
                <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                  Đã đăng ký {otp.setAt?.toISOString().slice(0, 10)} · cần đổi
                  trước {otp.expiresAt?.toISOString().slice(0, 10)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--ll-muted)" }}>
                Mỗi 30 ngày bạn cần đăng ký lại để xoay vòng secret. Nếu mất
                điện thoại, liên hệ admin để reset.
              </p>
              <Link
                href="/profile/otp-setup"
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--ll-border)",
                  fontSize: 13,
                  color: "var(--ll-ink)",
                  textDecoration: "none",
                }}
              >
                Đăng ký lại (xoay secret)
              </Link>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <span
                  className="ll-badge"
                  style={{
                    background: "var(--ll-orange-soft)",
                    color: "#c07600",
                  }}
                >
                  ⚠ {otp.enrolled ? "Hết hạn" : "Chưa đăng ký"}
                </span>
                <span style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                  {otp.enrolled
                    ? `Lần cuối: ${otp.setAt?.toISOString().slice(0, 10)} (>30 ngày)`
                    : "Bắt buộc cho staff nội bộ"}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--ll-muted)", margin: "8px 0 12px" }}>
                Quét QR bằng Google Authenticator / Microsoft Authenticator /
                1Password — nhập 6 số để xác nhận đồng bộ.
              </p>
              <Link
                href="/profile/otp-setup"
                style={{
                  display: "inline-block",
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--ll-green)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Đăng ký OTP ngay
              </Link>
            </>
          )}
        </section>
      )}
    </PageShell>
  );
}
