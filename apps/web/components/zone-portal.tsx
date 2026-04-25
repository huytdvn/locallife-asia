import Link from "next/link";
import { Chat } from "@/components/chat";
import { AppNav } from "@/components/app-nav";
import type { Role, Zone } from "@/lib/rbac";

interface Props {
  zone: Zone;
  brandName: string;
  subtitle: string;
  accent: string;
  starterQuestions: string[];
  userName: string;
  role: Role;
  docCount: number;
}

const ZONE_TO_NAV: Record<Zone, "host" | "lok" | "public" | "home"> = {
  host: "host",
  lok: "lok",
  public: "public",
  internal: "home",
};

/**
 * Portal shell dùng cho /host, /lok, /public. Giữ chat + branding của zone.
 */
export function ZonePortal({
  zone,
  brandName,
  subtitle,
  accent,
  starterQuestions,
  userName,
  role,
  docCount,
}: Props) {
  return (
    <main
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "16px 24px 24px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppNav role={role} active={ZONE_TO_NAV[zone]} />

      <header
        style={{
          marginBottom: 16,
          borderLeft: `4px solid ${accent}`,
          paddingLeft: 14,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: accent,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {brandName}
        </div>
        <h1
          style={{
            margin: "2px 0 0",
            fontSize: 22,
            color: "var(--ll-ink)",
            fontWeight: 700,
          }}
        >
          {subtitle}
        </h1>
        <p style={{ color: "var(--ll-muted)", fontSize: 14, marginTop: 4 }}>
          Hỏi Bé Tre về quy trình, tiêu chuẩn, FAQ dành cho bạn — kèm nguồn tài
          liệu.
          {docCount > 0 && ` (${docCount} tài liệu)`}
        </p>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        <Chat starterQuestions={starterQuestions} userName={userName} />
      </div>

      <p
        style={{
          fontSize: 12,
          color: "var(--ll-muted)",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        Role hiện tại: <strong>{role}</strong>. Cần hỗ trợ?{" "}
        <Link href="mailto:support@locallife.asia">support@locallife.asia</Link>
      </p>
    </main>
  );
}
