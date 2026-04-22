import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminUpload } from "@/components/admin-upload";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  const role = session?.role ?? "employee";
  if (!session?.user?.email) redirect("/login?next=/admin");
  if (role !== "admin" && role !== "lead") {
    return (
      <main style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}>
        <h1>Chỉ dành cho admin/lead</h1>
        <p>Bạn đăng nhập với role <code>{role}</code>.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24 }}>
      <h1 style={{ margin: 0 }}>Admin</h1>
      <p style={{ color: "var(--ll-muted)", marginTop: 4 }}>
        Nạp tài liệu, theo dõi job, review draft PR.
      </p>
      <section style={{ marginTop: 32 }}>
        <h2>Upload tài liệu</h2>
        <AdminUpload />
      </section>
    </main>
  );
}
