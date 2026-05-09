import Link from "next/link";
import { UserBadge } from "@/components/user-badge";
import type { NavLinkData } from "@/components/mobile-nav-drawer";
import type { ProfileMenuItem } from "@/components/profile-menu";
import { NavIcon, ICON_ACCENTS, type NavIconKey } from "@/components/nav-icons";
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
  /** SVG icon key (nav-icons.tsx). Mobile chỉ icon, desktop icon + label. */
  iconKey: NavIconKey;
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
    iconKey: s.iconKey,
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
          aria-label="Bé Tre — về trang chủ"
          style={{
            display: "flex",
            alignItems: "center",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.webp"
            alt="Bé Tre"
            width={28}
            height={36}
            style={{ borderRadius: 8, objectFit: "contain" }}
          />
        </Link>

        <div
          className="ll-nav-desktop"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
            paddingLeft: 4,
          }}
        >
          {navLinks.map((l) => (
            <NavLink
              key={`${l.key}-${l.href}`}
              href={l.href}
              active={l.active}
              iconKey={l.iconKey}
              label={l.label}
            />
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
        {/* MobileNavDrawer ẩn — nav links inline mọi viewport (icon-only mobile) */}
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
  // Internal có 2 layer onboarding/training:
  //   - Legacy `/onboarding` `/training` (weekly_assignment + file-based)
  //   - Mới `/onboarding/flows` `/training/quizzes` (admin builders)
  // Topbar cho user thường (employee) trỏ thẳng vào layer mới — đó là nơi
  // bài admin tạo qua /admin/onboarding/new sẽ hiển thị. Admin/lead vẫn
  // dùng layer cũ làm dashboard, có shortcut tới layer mới ở trong page.
  if (isInternal) {
    topbar.push({ href: "/dashboard", label: "Tổng quan", iconKey: "dashboard", key: "dashboard" });
    topbar.push({ href: "/", label: "Trợ lý AI", iconKey: "chat", key: "home" });
    topbar.push({ href: "/onboarding/flows", label: "Lộ trình", iconKey: "route", key: "onboarding" });
    topbar.push({ href: "/training/quizzes", label: "Quiz", iconKey: "target", key: "training" });
  } else if (role === "host") {
    topbar.push({ href: "/host", label: "Cổng Host", iconKey: "home", key: "host" });
    topbar.push({ href: "/", label: "Trợ lý AI", iconKey: "chat", key: "home" });
    topbar.push({ href: "/training/quizzes", label: "Quiz", iconKey: "target", key: "training" });
  } else if (role === "lok") {
    topbar.push({ href: "/lok", label: "Cổng LOK", iconKey: "star", key: "lok" });
    topbar.push({ href: "/", label: "Trợ lý AI", iconKey: "chat", key: "home" });
    topbar.push({ href: "/training/quizzes", label: "Quiz", iconKey: "target", key: "training" });
  } else {
    topbar.push({ href: "/public", label: "Trang công khai", iconKey: "globe", key: "public" });
    topbar.push({ href: "/training/quizzes", label: "Quiz", iconKey: "target", key: "training" });
  }

  // ─── PROFILE MENU: tài khoản (mọi role login) ───
  menuItems.push({ href: "/profile", label: "Hồ sơ", group: "account" });

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
        href: "/admin/onboarding/flows-list",
        label: "📚 Quản lý lộ trình",
        group: "manage",
      });
      menuItems.push({
        href: "/admin/training",
        label: "🎯 Quản lý quiz",
        group: "manage",
      });
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
  iconKey,
  label,
}: {
  href: string;
  active: boolean;
  iconKey?: NavIconKey;
  label: string;
}) {
  const accent = iconKey ? ICON_ACCENTS[iconKey] : null;
  // Active: icon nhuộm green-dark trên pill green-soft (LL primary).
  // Inactive: icon nhuộm theo accent fg, pill nhẹ accent bg → đa sắc.
  const iconColor = active ? "var(--ll-green-dark)" : accent?.fg ?? "var(--ll-ink-soft)";
  const pillBg = active ? "var(--ll-green-soft)" : accent?.bg ?? "transparent";
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="ll-nav-link"
      style={{
        fontSize: 14,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--ll-green-dark)" : "var(--ll-ink-soft)",
        textDecoration: "none",
        padding: "6px 10px",
        borderRadius: 10,
        background: pillBg,
        transition: "all 140ms var(--ll-ease)",
        whiteSpace: "nowrap",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {iconKey && (
        <span
          className="ll-nav-link-icon"
          style={{ display: "inline-flex", color: iconColor }}
          aria-hidden
        >
          <NavIcon name={iconKey} />
        </span>
      )}
      <span className="ll-nav-link-label">{label}</span>
    </Link>
  );
}
