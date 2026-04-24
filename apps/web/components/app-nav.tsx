"use client";

import Link from "next/link";
import { useState } from "react";
import { UserBadge } from "@/components/user-badge";
import type { Role } from "@/lib/rbac";

type NavKey =
  | "home"
  | "dashboard"
  | "training"
  | "admin"
  | "admin-docs"
  | "admin-report"
  | "host"
  | "lok"
  | "public";

interface Props {
  role: Role;
  active: NavKey;
}

/**
 * Shared top nav. Role-aware + mobile hamburger drawer.
 */
export function AppNav({ role, active }: Props) {
  const [open, setOpen] = useState(false);
  const isInternal = ["employee", "lead", "admin"].includes(role);
  const isStaff = role === "admin" || role === "lead";
  const isAdmin = role === "admin";

  const links: { href: string; label: string; key: NavKey; subtle?: boolean }[] =
    [];

  if (isInternal) {
    links.push(
      { href: "/dashboard", label: "Tổng quan", key: "dashboard" },
      { href: "/", label: "Trợ lý AI", key: "home" },
      { href: "/training", label: "Training", key: "training" },
    );
  }
  if (role === "host") {
    links.push({ href: "/host", label: "Cổng Host", key: "host" });
  }
  if (role === "lok") {
    links.push({ href: "/lok", label: "Cổng LOK", key: "lok" });
  }
  if (role === "guest") {
    links.push({ href: "/public", label: "Trang công khai", key: "public" });
  }
  if (role === "host" || role === "lok" || role === "guest") {
    links.push({ href: "/training", label: "Training", key: "training" });
  }
  if (isStaff) {
    links.push({ href: "/admin", label: "Admin", key: "admin" });
    links.push({
      href: "/admin/docs",
      label: "Tài liệu",
      key: "admin-docs",
      subtle: true,
    });
    links.push({
      href: "/admin/training-report",
      label: "Training report",
      key: "admin-report",
      subtle: true,
    });
  }
  if (isAdmin) {
    links.push({ href: "/host", label: "Host", key: "host", subtle: true });
    links.push({ href: "/lok", label: "LOK", key: "lok", subtle: true });
  }

  return (
    <>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
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

          {/* Desktop nav — hidden on mobile via CSS */}
          <div
            className="ll-nav-desktop"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
              minWidth: 0,
            }}
          >
            <span style={{ color: "var(--ll-border)" }} aria-hidden>
              ·
            </span>
            {links.map((l) => (
              <NavLink
                key={`${l.key}-${l.href}`}
                href={l.href}
                active={active === l.key}
                subtle={l.subtle}
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <UserBadge />
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Mở menu"
            onClick={() => setOpen(true)}
            className="ll-nav-mobile"
            style={{
              display: "none",
              width: 40,
              height: 40,
              border: "1px solid var(--ll-border)",
              borderRadius: 8,
              background: "white",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span
              style={{
                width: 18,
                height: 12,
                display: "inline-flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
              aria-hidden
            >
              <span style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }} />
              <span style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }} />
              <span style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }} />
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(6,45,26,0.4)",
            zIndex: 100,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(280px, 86vw)",
              background: "var(--ll-surface)",
              padding: "20px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxShadow: "var(--ll-shadow-lg)",
              animation: "ll-fade-up 220ms var(--ll-ease) both",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--ll-green-dark)",
                  fontSize: 15,
                }}
              >
                Menu
              </span>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  color: "var(--ll-muted)",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
            {links.map((l) => (
              <Link
                key={`mobile-${l.key}-${l.href}`}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background:
                    active === l.key ? "var(--ll-green-soft)" : "transparent",
                  color:
                    active === l.key
                      ? "var(--ll-green-dark)"
                      : "var(--ll-ink)",
                  fontWeight: active === l.key ? 600 : 500,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
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
      }}
    >
      {children}
    </Link>
  );
}
