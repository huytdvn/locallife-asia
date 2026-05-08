import Link from "next/link";
import { UserBadge } from "@/components/user-badge";
import { MobileNavDrawer, type NavLinkData } from "@/components/mobile-nav-drawer";
import type { ProfileMenuItem } from "@/components/profile-menu";
import type { Role } from "@/lib/rbac";

type NavKey =
  | "home"
  | "dashboard"
  | "training"
  | "onboarding"
  | "admin"
  | "admin-docs"
  | "admin-report"
  | "admin-users"
  | "admin-onboarding"
  | "host"
  | "lok"
  | "public";

interface Props {
  role: Role;
  active: NavKey;
}

interface TopbarLink {
  href: string;
  label: string;
  key: NavKey;
}

/**
 * Shared top nav. Layout split:
 * - Top bar (luôn hiển thị): chỉ "tương tác hằng ngày" (chat / dashboard /
 *   training / onboarding tuỳ role).
 * - Profile dropdown (xổ từ avatar phải): chứa các link quản trị + xem dưới
 *   role khác + Đăng xuất. Tham chiếu thiết kế: ngăn người dùng phải scan
 *   qua mọi tool admin mỗi lần — chúng nằm gọn trong 1 menu xổ dọc.
 *
 * Mobile drawer chỉ liệt kê top-bar items (manage/preview đã có chỗ trong
 * profile dropdown — dropdown hoạt động cả mobile + desktop).
 */
export function AppNav({ role, active }: Props) {
  const { topbar, menuItems } = buildLinksForRole(role);

  const navLinks: NavLinkData[] = topbar.map((s) => ({
    href: s.href,
    label: s.label,
    key: s.key,
    active: active === s.key,
    group: "primary",
  }));

  return (
    <nav
      className="ll-app-nav"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "nowrap",
        marginBottom: 20,
        gap: 12,
        paddingBottom: 12,
        borderBottom: "1px solid var(--ll-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Link
          href={homeForRole(role)}
          style={{
            fontWeight: 700,
            color: "var(--ll-green-dark)",
            fontSize: 17,
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.webp"
            alt="Bé Tre"
            width={24}
            height={32}
            style={{ borderRadius: 8, objectFit: "contain" }}
          />
          Bé Tre
        </Link>

        <div
          className="ll-nav-desktop"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            paddingLeft: 8,
          }}
        >
          {navLinks.map((l) => (
            <NavLink
              key={`${l.key}-${l.href}`}
              href={l.href}
              active={l.active}
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <UserBadge menuItems={menuItems} />
        <MobileNavDrawer links={navLinks} />
      </div>
    </nav>
  );
}

function homeForRole(role: Role): string {
  if (role === "host") return "/host";
  if (role === "lok") return "/lok";
  if (role === "guest") return "/public";
  return "/dashboard";
}

interface BuiltLinks {
  topbar: TopbarLink[];
  menuItems: ProfileMenuItem[];
}

function buildLinksForRole(role: Role): BuiltLinks {
  const isInternal = role === "employee" || role === "lead" || role === "admin";
  const isStaff = role === "admin" || role === "lead";
  const isAdmin = role === "admin";

  const topbar: TopbarLink[] = [];
  const menuItems: ProfileMenuItem[] = [];

  // ─── TOP BAR: tương tác hằng ngày ───
  if (isInternal) {
    topbar.push({ href: "/dashboard", label: "Tổng quan", key: "dashboard" });
    topbar.push({ href: "/", label: "Trợ lý AI", key: "home" });
    topbar.push({ href: "/onboarding", label: "Onboarding", key: "onboarding" });
    topbar.push({ href: "/training", label: "Training", key: "training" });
  } else if (role === "host") {
    topbar.push({ href: "/host", label: "Cổng Host", key: "host" });
    topbar.push({ href: "/", label: "Trợ lý AI", key: "home" });
    topbar.push({ href: "/training", label: "Training", key: "training" });
  } else if (role === "lok") {
    topbar.push({ href: "/lok", label: "Cổng LOK", key: "lok" });
    topbar.push({ href: "/", label: "Trợ lý AI", key: "home" });
    topbar.push({ href: "/training", label: "Training", key: "training" });
  } else {
    topbar.push({ href: "/public", label: "Trang công khai", key: "public" });
    topbar.push({ href: "/training", label: "Training", key: "training" });
  }

  // ─── PROFILE MENU: quản trị ───
  if (isStaff) {
    menuItems.push({ href: "/admin", label: "Admin (tổng quan)", group: "manage" });
    menuItems.push({ href: "/admin/docs", label: "Tài liệu", group: "manage" });
    menuItems.push({
      href: "/admin/onboarding",
      label: "Onboarding admin",
      group: "manage",
    });
    menuItems.push({
      href: "/admin/training-report",
      label: "Training report",
      group: "manage",
    });
    if (isAdmin) {
      menuItems.push({
        href: "/admin/users",
        label: "Quản lý user",
        group: "manage",
      });
    }
  }

  // ─── PROFILE MENU: xem dưới role khác (admin only) ───
  if (isAdmin) {
    menuItems.push({ href: "/host", label: "Xem dưới Host", group: "preview" });
    menuItems.push({ href: "/lok", label: "Xem dưới LOK", group: "preview" });
  }

  return { topbar, menuItems };
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--ll-green-dark)" : "var(--ll-ink-soft)",
        textDecoration: "none",
        padding: "4px 2px",
        borderBottom: active
          ? "2px solid var(--ll-green-bright)"
          : "2px solid transparent",
        transition: "color 120ms var(--ll-ease)",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {children}
    </Link>
  );
}
