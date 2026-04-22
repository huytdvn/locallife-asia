import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ll-cream)",
      }}
    >
      <form
        action={async () => {
          "use server";
          const params = await searchParams;
          await signIn("google", { redirectTo: params.next ?? "/" });
        }}
        style={{
          background: "white",
          padding: 32,
          borderRadius: 12,
          border: "1px solid var(--ll-border)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minWidth: 320,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>Đăng nhập Local Life</h1>
        <p style={{ margin: 0, color: "var(--ll-muted)", fontSize: 14 }}>
          Dùng tài khoản Google Workspace @locallife.asia.
        </p>
        <button
          type="submit"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: "var(--ll-green)",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Đăng nhập với Google
        </button>
      </form>
    </main>
  );
}
