import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AdminUpload } from "@/components/admin-upload";
import { ReorganizeButton } from "@/components/reorganize-button";
import { computeStats } from "@/lib/stats";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin");
  const role = (session.role ?? "employee") as Role;

  if (role !== "admin" && role !== "lead") {
    return (
      <PageShell maxWidth={960}>
        <AppNav role={role} active="admin" />
        <div
          className="ll-card ll-anim-in"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <h1 style={{ margin: 0, color: "var(--ll-green-dark)" }}>
            Khu vực dành cho team lead / admin
          </h1>
          <p style={{ margin: 0, color: "var(--ll-muted)" }}>
            Trang này quản lý upload và governance của knowledge base. Bạn đang
            login với role <code>{role}</code>. Nếu bạn cần quyền admin/lead,
            gửi email tới{" "}
            <a href="mailto:ops@locallife.asia">ops@locallife.asia</a>.
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login?next=/admin" });
            }}
          >
            <button
              type="submit"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                border: "none",
                background: "var(--ll-green)",
                color: "white",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Đăng xuất & đăng nhập với role khác
            </button>
          </form>
        </div>
      </PageShell>
    );
  }

  const stats = computeStats(role);
  const isAdmin = role === "admin";

  return (
    <PageShell maxWidth={1200}>
      <AppNav role={role} active="admin" />

      <header style={{ marginBottom: 20 }}>
        <h1
          style={{
            margin: 0,
            color: "var(--ll-green-dark)",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          Quản trị knowledge base
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            color: "var(--ll-muted)",
            fontSize: 14,
            maxWidth: 640,
          }}
        >
          Upload tài liệu (file riêng lẻ hoặc cả thư mục) — pipeline tự parse +
          AI phân loại + mở PR draft cho bạn review. Admin có thể dùng nút{" "}
          <strong>Sắp xếp &amp; hệ thống lại toàn bộ</strong> để chuẩn hoá
          văn phong cho cả KB.
        </p>
      </header>

      <div className="ll-grid-stats" style={{ marginBottom: 20 }}>
        <StatCard label="Tổng doc" value={stats.totalVisible} accent="green" />
        <StatCard label="Phòng ban" value={stats.byDepartment.length} />
        <StatCard
          label="Hạn chế"
          value={stats.bySensitivity.restricted}
          accent="red"
        />
        <StatCard
          label="Cần review"
          value={stats.staleCount}
          accent={stats.staleCount > 0 ? "orange" : "green"}
        />
      </div>

      <div className="ll-grid-2col" style={{ gap: 20 }}>
        <section
          className="ll-card ll-anim-in"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <SectionHeader
            title="Upload tài liệu"
            subtitle="File riêng lẻ hoặc cả thư mục — AI tự phân loại, bạn chỉ cần điền owner."
          />
          <AdminUpload />
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isAdmin && (
            <section
              className="ll-card ll-anim-in"
              style={{
                borderLeft: "4px solid var(--ll-green-bright)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 15,
                  color: "var(--ll-green-dark)",
                  fontWeight: 600,
                }}
              >
                Sắp xếp &amp; hệ thống lại toàn bộ
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--ll-muted)",
                  lineHeight: 1.5,
                }}
              >
                AI sẽ đọc toàn bộ knowledge base, chuẩn hoá văn phong doanh
                nghiệp, sửa tiêu đề, di chuyển file về đúng zone/department. Có
                preview trước khi apply.
              </p>
              <ReorganizeButton />
            </section>
          )}

          <Link
            href="/admin/docs"
            style={{ textDecoration: "none" }}
            className="ll-anim-in"
          >
            <div
              className="ll-card"
              style={{
                borderLeft: "4px solid var(--ll-green)",
                transition: "all 120ms var(--ll-ease)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 6px",
                  fontSize: 15,
                  color: "var(--ll-green-dark)",
                  fontWeight: 600,
                }}
              >
                Quản lý tài liệu →
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--ll-muted)",
                  lineHeight: 1.5,
                }}
              >
                Xem {stats.totalVisible} doc, tìm/filter nhanh, edit trực tiếp,
                deprecate khi cần.
              </p>
            </div>
          </Link>

          <Link
            href="/admin/training-report"
            style={{ textDecoration: "none" }}
            className="ll-anim-in"
          >
            <div
              className="ll-card"
              style={{
                borderLeft: "4px solid var(--ll-orange)",
                transition: "all 120ms var(--ll-ease)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 6px",
                  fontSize: 15,
                  color: "var(--ll-green-dark)",
                  fontWeight: 600,
                }}
              >
                Báo cáo Training →
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: "var(--ll-muted)",
                  lineHeight: 1.5,
                }}
              >
                Ai đang học lộ trình nào · điểm quiz · % hoàn thành · export CSV.
              </p>
            </div>
          </Link>

          <section
            className="ll-card"
            style={{
              background: "var(--ll-grad-calm)",
              fontSize: 13,
              color: "var(--ll-ink)",
            }}
          >
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 12,
                color: "var(--ll-green-dark)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              Mẹo
            </h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                lineHeight: 1.7,
              }}
            >
              <li>
                Upload cả folder thì AI giữ cấu trúc thư mục gợi ý zone phù hợp.
              </li>
              <li>
                Sau khi upload, vào{" "}
                <Link href="/admin/docs">Quản lý tài liệu</Link> để review.
              </li>
              <li>Deprecate thay vì xoá — giữ history.</li>
              <li>
                Chạm <code>last_reviewed</code> khi re-verify.
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </PageShell>
  );
}
