import { auth, signOut } from "@/lib/auth";
import Link from "next/link";

/**
 * Thanh user nhỏ ở góc header — email + role + logout (+ switch account khi
 * không có đủ quyền).
 */
export async function UserBadge() {
  const session = await auth();
  const email = session?.user?.email;
  const role = session?.role ?? "employee";

  if (!email) {
    return (
      <Link
        href="/login"
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          background: "var(--ll-green)",
          color: "white",
          textDecoration: "none",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Đăng nhập
      </Link>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontSize: 13,
        color: "var(--ll-muted)",
      }}
    >
      <span>
        <strong style={{ color: "var(--ll-ink)" }}>{email}</strong>{" "}
        <span
          className="ll-badge"
          style={{
            background: `var(--ll-role-${role})`,
            color: "#111",
            marginLeft: 4,
          }}
        >
          {role}
        </span>
      </span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--ll-border)",
            background: "white",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
