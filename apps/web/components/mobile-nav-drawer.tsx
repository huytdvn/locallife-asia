"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface NavLinkData {
  href: string;
  label: string;
  key: string;
  active: boolean;
  subtle?: boolean;
}

/**
 * Mobile-only hamburger + drawer. Links được precompute bởi server
 * component AppNav rồi pass xuống qua props — giữ UserBadge + auth logic
 * ở server-side.
 */
export function MobileNavDrawer({ links }: { links: NavLinkData[] }) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Focus trap + Escape to close, plus restore focus to the opener
  // button once the drawer closes. Standard modal-dialog a11y.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusables = drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // restore focus to the opener when drawer closes
      openerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        aria-label="Mở menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="ll-nav-mobile"
        style={{
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
          <span
            style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }}
          />
          <span
            style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }}
          />
          <span
            style={{ height: 2, background: "var(--ll-ink)", borderRadius: 2 }}
          />
        </span>
      </button>

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
            ref={drawerRef}
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
                key={`${l.key}-${l.href}`}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: l.active ? "var(--ll-green-soft)" : "transparent",
                  color: l.active
                    ? "var(--ll-green-dark)"
                    : "var(--ll-ink)",
                  fontWeight: l.active ? 600 : 500,
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
