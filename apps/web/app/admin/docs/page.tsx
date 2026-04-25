import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DocsManager } from "@/components/docs-manager";
import { AppNav } from "@/components/app-nav";
import { PageShell } from "@/components/ui";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function AdminDocsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/docs");
  const role = (session.role ?? "employee") as Role;
  if (role !== "admin" && role !== "lead") {
    redirect("/admin");
  }
  const canEdit = role === "admin";

  return (
    <PageShell maxWidth={1280}>
      <AppNav role={role} active="admin-docs" />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/admin"
          style={{ fontSize: 13, color: "var(--ll-muted)" }}
        >
          ← Admin
        </Link>
        <div>
          <h1
            style={{
              margin: 0,
              color: "var(--ll-green-dark)",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            Quản lý tài liệu
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--ll-muted)",
              fontSize: 13,
            }}
          >
            {canEdit
              ? "Xem, chỉnh sửa, deprecate tài liệu — thay đổi áp dụng tức thì."
              : "Role lead: xem được, không sửa được. Cần admin để edit."}
          </p>
        </div>
      </div>

      <DocsManager canEdit={canEdit} />
    </PageShell>
  );
}
