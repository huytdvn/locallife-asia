import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import Link from "next/link";
import { ProfileMenu, type ProfileMenuItem } from "@/components/profile-menu";

interface Props {
  /** Items hiển thị trong dropdown — manage + preview groups gộp vào đây. */
  menuItems?: ProfileMenuItem[];
}

/**
 * Header user badge: chưa đăng nhập = button "Đăng nhập"; đã đăng nhập =
 * avatar/role chip có dropdown chứa account info, các link quản trị, và nút
 * Đăng xuất. Các link "tương tác hằng ngày" KHÔNG xuất hiện ở đây — chúng
 * thuộc top nav của <AppNav>.
 */
export async function UserBadge({ menuItems = [] }: Props) {
  const session = await auth();
  const email = session?.user?.email;
  const role = session?.role ?? "employee";

  if (!email) {
    return (
      <Link
        href="/login"
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          background: "var(--ll-green)",
          color: "white",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Đăng nhập
      </Link>
    );
  }

  return (
    <ProfileMenu
      email={email}
      role={role}
      items={menuItems}
      signOutAction={signOutAction.bind(null, "/login")}
    />
  );
}
