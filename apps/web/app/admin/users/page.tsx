import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/rbac";
import { AppNav } from "@/components/app-nav";
import { PageShell, SectionHeader } from "@/components/ui";
import { listRoles, ALL_ROLES } from "@/lib/roles";
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

  const rows = await listRoles();

  return (
    <PageShell maxWidth={1120}>
      <AppNav role={role} active="admin" />
      <SectionHeader
        title="Quản lý user & role"
        subtitle={`${rows.length} user — ${rows.filter((r) => !r.disabled).length} đang hoạt động`}
      />
      <UsersTable
        initialRows={rows}
        validRoles={ALL_ROLES}
        currentAdminEmail={session.user.email}
      />
    </PageShell>
  );
}
