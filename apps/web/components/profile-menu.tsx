"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export interface ProfileMenuItem {
  href: string;
  label: string;
  /** "manage" hay "preview" — dùng để group section. */
  group: "manage" | "preview";
}

interface Props {
  email: string;
  role: string;
  items: ProfileMenuItem[];
  signOutAction: () => Promise<void>;
}

const GROUP_LABEL: Record<ProfileMenuItem["group"], string> = {
  manage: "Quản trị",
  preview: "Xem dưới role khác",
};

/**
 * Avatar button + dropdown chứa account info, manage links, preview links,
 * signout. Dropdown đóng khi: click ngoài, ESC, click vào link, hoặc submit
 * signout. Focus trap khi mở. Có dot indicator nếu pathname đang ở /admin/*.
 */
export function ProfileMenu({ email, role, items, signOutAction }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const pathname = usePathname() ?? "";
  const inAdminArea = pathname.startsWith("/admin");

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;

    const focusables = menu.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || focusables.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (menu.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
      buttonRef.current?.focus();
    };
  }, [open]);

  const initials = (email[0] ?? "?").toUpperCase();
  const manageItems = items.filter((i) => i.group === "manage");
  const previewItems = items.filter((i) => i.group === "preview");

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={`${email} · ${role}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 4px 4px 8px",
          borderRadius: 999,
          border: "1px solid var(--ll-border)",
          background: open ? "var(--ll-surface-soft)" : "white",
          cursor: "pointer",
          fontSize: 13,
          color: "var(--ll-ink)",
          fontFamily: "inherit",
        }}
      >
        <span
          className="ll-badge"
          style={{
            background: `var(--ll-role-${role})`,
            color: "#111",
            fontSize: 10,
            padding: "2px 7px",
          }}
        >
          {role}
        </span>
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, var(--ll-green) 0%, var(--ll-green-dark) 100%)",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontSize: 13,
            fontWeight: 700,
            position: "relative",
          }}
        >
          {initials}
          {inAdminArea && (
            <span
              aria-label="Đang ở vùng quản trị"
              style={{
                position: "absolute",
                top: -2,
                right: -2,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "var(--ll-green-bright)",
                border: "2px solid white",
              }}
            />
          )}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="ll-profile-menu"
          style={{
            // position fixed để không bị parent container clip width.
            // CSS class .ll-profile-menu chịu trách nhiệm responsive
            // (mobile full-width, desktop right-anchored 280-320px).
            background: "white",
            border: "1px solid var(--ll-border)",
            borderRadius: 12,
            boxShadow: "var(--ll-shadow-md)",
            padding: 6,
            zIndex: 50,
            animation: "ll-fade-up 160ms var(--ll-ease) both",
          }}
        >
          <header
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--ll-border)",
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--ll-ink)",
                wordBreak: "break-all",
              }}
            >
              {email}
            </div>
            <div style={{ marginTop: 4 }}>
              <span
                className="ll-badge"
                style={{
                  background: `var(--ll-role-${role})`,
                  color: "#111",
                  fontSize: 11,
                }}
              >
                {role}
              </span>
            </div>
          </header>

          {manageItems.length > 0 && (
            <Section
              label={GROUP_LABEL.manage}
              items={manageItems}
              pathname={pathname}
              onClickItem={() => setOpen(false)}
            />
          )}
          {previewItems.length > 0 && (
            <Section
              label={GROUP_LABEL.preview}
              items={previewItems}
              pathname={pathname}
              onClickItem={() => setOpen(false)}
            />
          )}

          <div
            style={{
              borderTop: "1px solid var(--ll-border)",
              marginTop: 4,
              paddingTop: 4,
            }}
          >
            <form action={signOutAction}>
              <button
                type="submit"
                role="menuitem"
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  background: "transparent",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--ll-ink)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = "var(--ll-surface-soft)")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Section(props: {
  label: string;
  items: ProfileMenuItem[];
  pathname: string;
  onClickItem: () => void;
}) {
  return (
    <div style={{ padding: "4px 0" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--ll-muted)",
          padding: "6px 12px 4px",
        }}
      >
        {props.label}
      </div>
      {props.items.map((item) => {
        const active =
          props.pathname === item.href ||
          (item.href !== "/" && props.pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            role="menuitem"
            onClick={props.onClickItem}
            style={{
              display: "block",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ll-green-dark)" : "var(--ll-ink)",
              background: active ? "var(--ll-green-soft)" : "transparent",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
