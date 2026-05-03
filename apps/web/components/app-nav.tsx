import Link from "next/link";
import { UserBadge } from "@/components/user-badge";
import { MobileNavDrawer, type NavLinkData } from "@/components/mobile-nav-drawer";
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

type NavGroup = "primary" | "manage" | "preview";

interface Props {
  role: Role;
  active: NavKey;
}

interface LinkSpec {
  href: string;
  label: string;
  key: NavKey;
  group: NavGroup;
}

/**
 * Shared top nav (server component). Smart grouping per-role:
 * - "primary" — daily tasks, ordered by usage frequency.
 * - "manage" — staff/admin tools (lead + admin only).
 * - "preview" — admin-only role-switch preview.
 *
 * Visual: desktop separates groups by faded dot; mobile drawer shows
 * group label headings.
 */
export function AppNav({ role, active }: Props) {
  const specs: LinkSpec[] = buildLinksForRole(role);

  const navLinks: NavLinkData[] = specs.map((s) => ({
    href: s.href,
    label: s.label,
    key: s.key,
    subtle: s.group !== "primary",
    group: s.group,
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
          }}
        >
          {/* mascot 3:4 — image is 360×480, never force square */}
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
            gap: 16,
            minWidth: 0,
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          <span style={{ color: "var(--ll-border)", flexShrink: 0 }} aria-hidden>
            ·
          </span>
          {renderDesktopWithSeparators(navLinks)}
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

function homeForRole(role: Role): string {
  if (role === "host") return "/host";
  if (role === "lok") return "/lok";
  if (role === "guest") return "/public";
  return "/dashboard";
}

function buildLinksForRole(role: Role): LinkSpec[] {
  const isInternal = role === "employee" || role === "lead" || role === "admin";
  const isStaff = role === "admin" || role === "lead";
  const isAdmin = role === "admin";

  const out: LinkSpec[] = [];

  // ─── PRIMARY: daily tasks ───
  if (isInternal) {
    // Order by usage frequency: dashboard landing → chat (most used)
    // → onboarding (curated weekly) → training (full library).
    out.push({ href: "/dashboard", label: "Tổng quan", key: "dashboard", group: "primary" });
    out.push({ href: "/", label: "Trợ lý AI", key: "home", group: "primary" });
    out.push({ href: "/onboarding", label: "Onboarding", key: "onboarding", group: "primary" });
    out.push({ href: "/training", label: "Training", key: "training", group: "primary" });
  } else if (role === "host") {
    out.push({ href: "/host", label: "Cổng Host", key: "host", group: "primary" });
    out.push({ href: "/", label: "Trợ lý AI", key: "home", group: "primary" });
    out.push({ href: "/training", label: "Training", key: "training", group: "primary" });
  } else if (role === "lok") {
    out.push({ href: "/lok", label: "Cổng LOK", key: "lok", group: "primary" });
    out.push({ href: "/", label: "Trợ lý AI", key: "home", group: "primary" });
    out.push({ href: "/training", label: "Training", key: "training", group: "primary" });
  } else {
    // guest
    out.push({ href: "/public", label: "Trang công khai", key: "public", group: "primary" });
    out.push({ href: "/training", label: "Training", key: "training", group: "primary" });
  }

  // ─── MANAGE: staff/admin tools ───
  if (isStaff) {
    // Order by frequency of admin work: overview → docs (most edited)
    // → onboarding (weekly review) → training report (occasional).
    out.push({ href: "/admin", label: "Admin", key: "admin", group: "manage" });
    out.push({ href: "/admin/docs", label: "Tài liệu", key: "admin-docs", group: "manage" });
    out.push({
      href: "/admin/onboarding",
      label: "Onboarding admin",
      key: "admin-onboarding",
      group: "manage",
    });
    out.push({
      href: "/admin/training-report",
      label: "Training report",
      key: "admin-report",
      group: "manage",
    });
    if (isAdmin) {
      out.push({
        href: "/admin/users",
        label: "Quản lý user",
        key: "admin-users",
        group: "manage",
      });
    }
  }

  // ─── PREVIEW: role-switch (admin only) ───
  if (isAdmin) {
    out.push({ href: "/host", label: "Xem dưới Host", key: "host", group: "preview" });
    out.push({ href: "/lok", label: "Xem dưới LOK", key: "lok", group: "preview" });
  }

  return out;
}

function renderDesktopWithSeparators(links: NavLinkData[]): React.ReactNode {
  const result: React.ReactNode[] = [];
  let prevGroup: NavGroup | null = null;
  for (const l of links) {
    const grp = (l.group ?? "primary") as NavGroup;
    if (prevGroup !== null && grp !== prevGroup) {
      result.push(
        <span
          key={`sep-${grp}`}
          style={{ color: "var(--ll-border)", flexShrink: 0, fontSize: 11, opacity: 0.6 }}
          aria-hidden
        >
          •
        </span>
      );
    }
    result.push(
      <NavLink
        key={`${l.key}-${l.href}`}
        href={l.href}
        active={l.active}
        subtle={l.subtle}
      >
        {l.label}
      </NavLink>
    );
    prevGroup = grp;
  }
  return result;
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
