import type { ReactNode } from "react";

/* ─── Shared UI primitives — dùng chung 3 zones, giảm duplication. ─── */

export function PageShell({
  children,
  maxWidth = 1120,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <main
      style={{
        maxWidth,
        margin: "0 auto",
        padding: "24px 24px 48px",
        minHeight: "100vh",
      }}
    >
      {children}
    </main>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            color: "var(--ll-green-dark)",
            fontWeight: 600,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--ll-muted)",
              fontSize: 13,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "default",
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "default" | "green" | "orange" | "blue" | "red";
  icon?: ReactNode;
}) {
  const colors: Record<string, { fg: string; bg: string; border: string }> = {
    default: {
      fg: "var(--ll-ink)",
      bg: "white",
      border: "var(--ll-border)",
    },
    green: {
      fg: "var(--ll-green-dark)",
      bg: "var(--ll-green-soft)",
      border: "rgba(13,84,48,0.2)",
    },
    orange: {
      fg: "#c07600",
      bg: "var(--ll-orange-soft)",
      border: "rgba(230,126,34,0.3)",
    },
    blue: { fg: "#1e40af", bg: "#dbeafe", border: "#bfdbfe" },
    red: { fg: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  };
  const c = colors[accent];
  return (
    <div
      style={{
        padding: 18,
        borderRadius: "var(--ll-radius-md)",
        border: `1px solid ${c.border}`,
        background: c.bg,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 96,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
          color: "var(--ll-muted)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        <span>{label}</span>
        {icon && (
          <span style={{ fontSize: 16, opacity: 0.8 }} aria-hidden>
            {icon}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: c.fg,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>{sub}</div>
      )}
    </div>
  );
}

export function Hero({
  greeting,
  name,
  role,
  tagline,
  metrics,
  children,
}: {
  greeting: string;
  name: string;
  role: string;
  tagline?: string;
  metrics?: Array<{ label: string; value: string }>;
  children?: ReactNode;
}) {
  return (
    <section
      className="ll-anim-in ll-hero"
      style={{
        background:
          "var(--ll-grad-hero-accent), var(--ll-grad-hero)",
        color: "white",
        borderRadius: "var(--ll-radius-lg)",
        padding: "26px 30px",
        boxShadow: "var(--ll-shadow-md)",
        display: "flex",
        gap: 22,
        alignItems: "center",
        flexWrap: "wrap",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ flexShrink: 0, position: "relative", zIndex: 2 }}>
        {/* mascot 3:4 portrait — source 360×480, do not force square */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mascot.webp"
          alt="Bé Tre"
          width={84}
          height={112}
          className="ll-hero-mascot"
          style={{
            borderRadius: 20,
            objectFit: "contain",
            filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.25))",
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 220, position: "relative", zIndex: 2 }}>
        <div
          style={{
            fontSize: 13,
            opacity: 0.85,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          {greeting}
        </div>
        <h1
          className="ll-hero-title"
          style={{
            margin: "2px 0 6px",
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {name}{" "}
          <span
            style={{
              fontSize: 14,
              opacity: 0.7,
              fontWeight: 400,
              letterSpacing: "0.04em",
            }}
          >
            · {role}
          </span>
        </h1>
        {tagline && (
          <p
            style={{
              margin: 0,
              fontSize: 15,
              opacity: 0.92,
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            {tagline}
          </p>
        )}
        {metrics && metrics.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 20,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            {metrics.map((m) => (
              <div
                key={m.label}
                style={{ display: "flex", flexDirection: "column" }}
              >
                <span style={{ fontSize: 22, fontWeight: 700 }}>
                  {m.value}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    opacity: 0.75,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {m.label}
                </span>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
      {/* Organic blob accent */}
      <svg
        aria-hidden
        width="320"
        height="320"
        viewBox="0 0 200 200"
        style={{
          position: "absolute",
          right: -100,
          top: -100,
          opacity: 0.08,
          zIndex: 1,
        }}
      >
        <path
          fill="white"
          d="M46.7,-56.9C59.8,-46.4,69.2,-31.4,72.8,-14.8C76.4,1.9,74.2,20.3,64.7,34.3C55.2,48.3,38.3,58,20.7,63.6C3.1,69.2,-15.3,70.8,-31.7,64.9C-48.1,59,-62.6,45.5,-68.3,29.2C-74,12.9,-70.9,-6.3,-63.7,-22.9C-56.5,-39.5,-45.3,-53.6,-31.3,-63.3C-17.3,-73,-0.6,-78.4,13.5,-75.2C27.5,-72,33.6,-67.4,46.7,-56.9Z"
          transform="translate(100 100)"
        />
      </svg>
    </section>
  );
}

export function QuickActionCard({
  title,
  desc,
  href,
  accent = "green",
  icon,
}: {
  title: string;
  desc: string;
  href: string;
  accent?: "green" | "orange" | "blue" | "purple";
  icon?: ReactNode;
}) {
  const colors: Record<string, string> = {
    green: "var(--ll-green-bright)",
    orange: "var(--ll-orange)",
    blue: "#0891b2",
    purple: "#8b5cf6",
  };
  return (
    <a
      href={href}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 18,
        borderRadius: "var(--ll-radius-md)",
        border: "1px solid var(--ll-border)",
        background: "white",
        textDecoration: "none",
        color: "inherit",
        borderLeft: `4px solid ${colors[accent]}`,
        transition: "all 160ms var(--ll-ease)",
        boxShadow: "var(--ll-shadow-sm)",
      }}
    >
      {icon && <div style={{ fontSize: 24 }}>{icon}</div>}
      <div
        style={{
          fontWeight: 600,
          fontSize: 15,
          color: "var(--ll-green-dark)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{title}</span>
        <span
          style={{
            fontSize: 18,
            color: colors[accent],
          }}
        >
          →
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ll-muted)",
          lineHeight: 1.5,
        }}
      >
        {desc}
      </div>
    </a>
  );
}

export function MotivationalQuote({
  quote,
  source,
}: {
  quote: string;
  source?: string;
}) {
  return (
    <blockquote
      className="ll-anim-in"
      style={{
        margin: 0,
        padding: "20px 24px",
        borderRadius: "var(--ll-radius-md)",
        background: "var(--ll-grad-warm)",
        borderLeft: "4px solid var(--ll-orange)",
        fontSize: 15,
        fontStyle: "italic",
        color: "var(--ll-ink)",
        lineHeight: 1.7,
        position: "relative",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 8,
          left: 10,
          fontSize: 36,
          color: "var(--ll-orange)",
          opacity: 0.3,
          lineHeight: 1,
        }}
      >
        &ldquo;
      </span>
      <span style={{ paddingLeft: 16, display: "block" }}>{quote}</span>
      {source && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--ll-green-dark)",
            fontStyle: "normal",
            fontWeight: 600,
            paddingLeft: 16,
          }}
        >
          — {source}
        </div>
      )}
    </blockquote>
  );
}
