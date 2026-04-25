import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { listRoles, INTERNAL_ROLES } from "@/lib/roles";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/users");
  const role = (session.role ?? "guest") as Role;

  if (role !== "admin") {
    return (
      <PageShell maxWidth={960}>
        <AppNav role={role} active="admin" />
        <div className="ll-card ll-anim-in">
          <h1 style={{ margin: 0, color: "var(--ll-green-dark)" }}>
            Chỉ admin truy cập được
          </h1>
          <p style={{ margin: "12px 0 0", color: "var(--ll-muted)" }}>
            Bạn đang login với role <code>{role}</code>. Quản lý user/role
            yêu cầu quyền <code>admin</code>.
          </p>
        </div>
      </PageShell>
    );
  }

  const { rows, status, errorMessage } = await listRoles();

  const subtitle =
    status === "no-db"
      ? "DATABASE_URL chưa được set — đang chạy ở chế độ chỉ đọc env override."
      : status === "db-error"
        ? `Lỗi DB: ${errorMessage}. Kiểm tra Postgres + apply migration apps/web/db/migrations/2026-04-25-extend-roles.sql.`
        : `${rows.length} user — ${rows.filter((r) => !r.disabled).length} đang hoạt động`;

  return (
    <PageShell maxWidth={1120}>
      <AppNav role={role} active="admin-users" />
      <SectionHeader title="Quản lý user & role" subtitle={subtitle} />
      <p style={{ color: "var(--ll-muted)", fontSize: 13, margin: "-12px 0 16px" }}>
        Chỉ assign role nội bộ (admin / lead / employee) qua trang này. Host & LOK
        truy cập chat qua widget trong dashboard back-office — không cần tài khoản
        ở đây.
      </p>
      {(status === "no-db" || status === "db-error") && (
        <div
          className="ll-card ll-anim-in"
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            color: "#78350f",
            marginBottom: 16,
          }}
        >
          <strong>⚠️ DB chưa sẵn sàng</strong>
          <p style={{ margin: "8px 0 0", fontSize: 14 }}>
            Trang này cần Postgres + apply migration để hoạt động. Cho dev:
            <code style={{ marginLeft: 8 }}>
              docker compose -f infra/docker-compose.yml up -d
            </code>
            <br />
            rồi:
            <code style={{ marginLeft: 8 }}>
              psql $DATABASE_URL -f apps/web/db/migrations/2026-04-25-extend-roles.sql
            </code>
          </p>
        </div>
      )}
      <UsersTable
        initialRows={rows}
        validRoles={INTERNAL_ROLES}
        currentAdminEmail={session.user.email}
      />
    </PageShell>
  );
}
