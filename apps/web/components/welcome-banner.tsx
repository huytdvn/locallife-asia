import { timeGreeting, type KnowledgeStats } from "@/lib/stats";

interface Props {
  email: string;
  role: string;
  stats: KnowledgeStats;
}

/**
 * Banner ấm ở đầu dashboard/chat. Không "corporate", gọi tên, nhấn vào
 * điểm tích cực của ngày.
 */
export function WelcomeBanner({ email, role, stats }: Props) {
  const name = humanName(email);
  return (
    <section
      className="ll-anim-in"
      style={{
        background: "var(--ll-grad-warm)",
        border: "1px solid var(--ll-border)",
        borderRadius: "var(--ll-radius-lg)",
        padding: "28px 32px",
        boxShadow: "var(--ll-shadow-md)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg
        aria-hidden
        width="120"
        height="120"
        viewBox="0 0 120 120"
        style={{
          position: "absolute",
          right: -20,
          top: -20,
          opacity: 0.08,
        }}
      >
        <circle cx="60" cy="60" r="50" fill="var(--ll-green)" />
      </svg>
      <div style={{ fontSize: 13, color: "var(--ll-muted)", fontWeight: 500 }}>
        {timeGreeting()},
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 28,
          color: "var(--ll-green-dark)",
          lineHeight: 1.2,
        }}
      >
        {name} 👋
      </h1>
      <p
        style={{
          margin: "4px 0 0",
          color: "var(--ll-ink)",
          fontSize: 15,
          maxWidth: 600,
        }}
      >
        Hôm nay bạn có <strong>{stats.totalVisible} tài liệu</strong> có thể tra
        cứu. Tra hết cũng không sao — hỏi trợ lý AI phía dưới, có citation đầy
        đủ.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <span
          className="ll-badge"
          style={{
            background: `var(--ll-role-${role})`,
            color: "#111",
          }}
        >
          {role}
        </span>
        <span
          className="ll-badge"
          style={{
            background: "var(--ll-green-soft)",
            color: "var(--ll-green-dark)",
          }}
        >
          Coverage {stats.coveragePercent}%
        </span>
      </div>
    </section>
  );
}

function humanName(email: string): string {
  const local = email.split("@")[0] ?? "bạn";
  // `employee-dev` → `Employee dev`, `huy` → `Huy`
  return local
    .replace(/[-_.]/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}
