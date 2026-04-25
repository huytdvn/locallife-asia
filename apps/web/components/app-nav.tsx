import Link from "next/link";
import { UserBadge } from "@/components/user-badge";
import { MobileNavDrawer, type NavLinkData } from "@/components/mobile-nav-drawer";
import type { Role } from "@/lib/rbac";

type NavKey =
  | "home"
  | "dashboard"
  | "training"
  | "admin"
  | "admin-docs"
  | "admin-report"
  | "admin-users"
  | "host"
  | "lok"
  | "public";

interface Props {
  role: Role;
  active: NavKey;
}

/**
 * Shared top nav (server component). Role-aware + mobile drawer.
 * Links được compute server-side rồi pass cho MobileNavDrawer client.
 */
export function AppNav({ role, active }: Props) {
  const isInternal = ["employee", "lead", "admin"].includes(role);
  const isStaff = role === "admin" || role === "lead";
  const isAdmin = role === "admin";

  type LinkSpec = { href: string; label: string; key: NavKey; subtle?: boolean };
  const specs: LinkSpec[] = [];
  if (isInternal) {
    specs.push(
      { href: "/dashboard", label: "Tổng quan", key: "dashboard" },
      { href: "/", label: "Trợ lý AI", key: "home" },
      { href: "/training", label: "Training", key: "training" },
    );
  }
  if (role === "host") {
    specs.push({ href: "/host", label: "Cổng Host", key: "host" });
  }
  if (role === "lok") {
    specs.push({ href: "/lok", label: "Cổng LOK", key: "lok" });
  }
  if (role === "guest") {
    specs.push({ href: "/public", label: "Trang công khai", key: "public" });
  }
  if (role === "host" || role === "lok" || role === "guest") {
    specs.push({ href: "/training", label: "Training", key: "training" });
  }
  if (isStaff) {
    specs.push({ href: "/admin", label: "Admin", key: "admin" });
    specs.push({
      href: "/admin/docs",
      label: "Tài liệu",
      key: "admin-docs",
      subtle: true,
    });
    specs.push({
      href: "/admin/training-report",
      label: "Training report",
      key: "admin-report",
      subtle: true,
    });
  }
  if (isAdmin) {
    specs.push({
      href: "/admin/users",
      label: "Quản lý user",
      key: "admin-users",
      subtle: true,
    });
  }
  if (isAdmin) {
    specs.push({ href: "/host", label: "Host", key: "host", subtle: true });
    specs.push({ href: "/lok", label: "LOK", key: "lok", subtle: true });
  }

  const navLinks: NavLinkData[] = specs.map((s) => ({
    href: s.href,
    label: s.label,
    key: s.key,
    subtle: s.subtle,
    active: active === s.key,
  }));

  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
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
          href="/"
          style={{
            fontWeight: 700,
            color: "var(--ll-green-dark)",
            fontSize: 17,
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.webp"
            alt="Bé Tre"
            width={30}
            height={30}
            style={{ borderRadius: 8 }}
          />
          Bé Tre
        </Link>

        <div
          className="ll-nav-desktop"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          <span
            style={{ color: "var(--ll-border)", flexShrink: 0 }}
            aria-hidden
          >
            ·
          </span>
          {navLinks.map((l) => (
            <NavLink
              key={`${l.key}-${l.href}`}
              href={l.href}
              active={l.active}
              subtle={l.subtle}
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
        <UserBadge />
        <MobileNavDrawer links={navLinks} />
      </div>
    </nav>
  );
}

function NavLink({
  href,
  active,
  subtle,
  children,
}: {
  href: string;
  active: boolean;
  subtle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: subtle ? 13 : 14,
        fontWeight: active ? 600 : 400,
        color: active
          ? "var(--ll-green-dark)"
          : subtle
            ? "var(--ll-muted)"
            : "var(--ll-ink-soft)",
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
