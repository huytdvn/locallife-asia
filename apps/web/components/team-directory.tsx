import type { KnowledgeStats } from "@/lib/stats";

interface Props {
  stats: KnowledgeStats;
}

/**
 * Danh bạ "hỏi ai về gì" — owner của docs xếp theo số lượng.
 * Khuyến khích nhân viên gõ cửa trực tiếp thay vì chỉ chat AI.
 */
export function TeamDirectory({ stats }: Props) {
  const owners = [...stats.owners.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (owners.length === 0) return null;
  return (
    <section className="ll-card ll-anim-in">
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "var(--ll-green-dark)" }}>
          Hỏi ai khi AI chưa đủ?
        </h2>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "var(--ll-muted)",
          }}
        >
          Mỗi tài liệu đều có người chịu trách nhiệm nội dung — họ biết nhiều hơn AI.
        </p>
      </header>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {owners.map(([email, count]) => (
          <a
            key={email}
            href={`mailto:${email}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
              borderRadius: "var(--ll-radius-md)",
              border: "1px solid var(--ll-border)",
              textDecoration: "none",
              transition: "all 120ms var(--ll-ease)",
              background: "white",
            }}
            className="ll-owner-row"
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: `linear-gradient(135deg, var(--ll-green) 0%, var(--ll-orange) 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initialsFor(email)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--ll-ink)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </div>
              <div style={{ fontSize: 12, color: "var(--ll-muted)" }}>
                Chịu trách nhiệm {count} tài liệu
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function initialsFor(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[-_.]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
