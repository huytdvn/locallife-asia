interface Props {
  tip: string;
}

/**
 * Thẻ "insight của hôm nay" — 1 dòng warm từ knowledge base, xoay mỗi ngày.
 */
export function DailyInsight({ tip }: Props) {
  return (
    <section
      className="ll-card ll-anim-in"
      style={{
        borderLeft: "4px solid var(--ll-orange)",
        background: "var(--ll-surface-soft)",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ll-orange)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 6,
        }}
      >
        Hôm nay trong Local Life
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: "var(--ll-ink)",
          lineHeight: 1.6,
        }}
      >
        {tip}
      </p>
    </section>
  );
}
