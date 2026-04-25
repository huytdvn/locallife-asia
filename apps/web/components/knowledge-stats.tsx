import type { KnowledgeStats } from "@/lib/stats";

interface Props {
  stats: KnowledgeStats;
}

const SENS_COLOR: Record<string, string> = {
  public: "var(--ll-sens-public)",
  internal: "var(--ll-sens-internal)",
  restricted: "var(--ll-sens-restricted)",
};
const SENS_LABEL: Record<string, string> = {
  public: "Công khai",
  internal: "Nội bộ",
  restricted: "Hạn chế",
};

export function KnowledgeStatsPanel({ stats }: Props) {
  const total = stats.totalVisible;
  const sensTotal = Object.values(stats.bySensitivity).reduce((a, b) => a + b, 0);

  return (
    <section
      className="ll-card ll-anim-in"
      style={{ display: "flex", flexDirection: "column", gap: 20 }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--ll-green-dark)" }}>
          Thư viện tri thức
        </h2>
        <span style={{ color: "var(--ll-muted)", fontSize: 13 }}>
          {total} tài liệu bạn xem được
        </span>
      </header>

      {/* By department — horizontal bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ll-muted)" }}>
          Phân theo phòng ban
        </div>
        {stats.byDepartment.map((d) => (
          <div key={d.dept} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--ll-ink)" }}>{d.dept}</span>
              <span style={{ color: "var(--ll-muted)" }}>
                {d.count} ({Math.round(d.share * 100)}%)
              </span>
            </div>
            <div className="ll-bar">
              <span style={{ width: `${Math.max(4, d.share * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* By sensitivity — stacked segment */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ll-muted)" }}>
          Phân loại mức nhạy cảm
        </div>
        <div
          style={{
            display: "flex",
            height: 28,
            borderRadius: 999,
            overflow: "hidden",
            border: "1px solid var(--ll-border)",
          }}
        >
          {(["public", "internal", "restricted"] as const).map((k) => {
            const count = stats.bySensitivity[k];
            const share = sensTotal > 0 ? (count / sensTotal) * 100 : 0;
            if (share === 0) return null;
            return (
              <div
                key={k}
                title={`${SENS_LABEL[k]}: ${count}`}
                style={{
                  width: `${share}%`,
                  background: SENS_COLOR[k],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#111",
                }}
              >
                {share > 12 && `${SENS_LABEL[k]} ${count}`}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coverage indicator */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <StatCard
          label="Còn mới (≤90 ngày)"
          value={`${stats.coveragePercent}%`}
          sub={`${total - stats.staleCount}/${total} tài liệu`}
          accent="green"
        />
        <StatCard
          label="Cần review"
          value={`${stats.staleCount}`}
          sub={stats.staleCount > 0 ? "Quá 90 ngày" : "Toàn bộ đang mới"}
          accent={stats.staleCount > 0 ? "orange" : "green"}
        />
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "green" | "orange";
}) {
  return (
    <div
      style={{
        background:
          accent === "green" ? "var(--ll-green-soft)" : "var(--ll-orange-soft)",
        padding: 16,
        borderRadius: "var(--ll-radius-md)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>{label}</div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: accent === "green" ? "var(--ll-green-dark)" : "#c07600",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>{sub}</div>
    </div>
  );
}
