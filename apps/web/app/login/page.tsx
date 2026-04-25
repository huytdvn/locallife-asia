import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

const IS_PROD = process.env.NODE_ENV === "production";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next ?? "/";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(1200px circle at 0% 0%, rgba(27,107,74,0.08), transparent 40%), radial-gradient(1000px circle at 100% 100%, rgba(245,166,35,0.12), transparent 45%), var(--ll-bg)",
      }}
    >
      <div
        className="ll-anim-in"
        style={{
          background: "var(--ll-surface)",
          padding: 32,
          borderRadius: "var(--ll-radius-lg)",
          border: "1px solid var(--ll-border)",
          boxShadow: "var(--ll-shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minWidth: 400,
          maxWidth: 440,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            marginBottom: 4,
            filter: "drop-shadow(0 6px 12px rgba(6,45,26,0.18))",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.webp"
            alt="Bé Tre"
            width={72}
            height={72}
            style={{ width: "100%", height: "auto" }}
          />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            color: "var(--ll-green-dark)",
          }}
        >
          Chào, mình là Bé Tre
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--ll-muted)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          Trợ lý AI nội bộ Local Life — hỏi đáp quy trình, đối tác, sản phẩm,
          luôn kèm nguồn tài liệu rõ ràng.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: nextPath });
          }}
          style={{ marginTop: 8 }}
        >
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: "var(--ll-green)",
              color: "white",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              boxShadow: "var(--ll-shadow-sm)",
            }}
          >
            Đăng nhập với Google Workspace
          </button>
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--ll-muted)",
              textAlign: "center",
            }}
          >
            Chỉ hỗ trợ email @locallife.asia
          </p>
        </form>

        {!IS_PROD && (
          <div
            style={{
              marginTop: 16,
              borderTop: "1px dashed var(--ll-border)",
              paddingTop: 16,
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 12,
                color: "var(--ll-muted)",
                textAlign: "center",
              }}
            >
              <strong>Dev bypass</strong> · chỉ bật khi <code>NODE_ENV != production</code>
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {(
                ["employee", "lead", "admin", "host", "lok", "guest"] as const
              ).map((role) => (
                <form
                  key={role}
                  action={async () => {
                    "use server";
                    await signIn("dev", {
                      role,
                      redirectTo: nextPath,
                    });
                  }}
                  style={{ flex: 1 }}
                >
                  <button
                    type="submit"
                    style={{
                      width: "100%",
                      padding: "10px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--ll-border)",
                      background: "white",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                      textTransform: "capitalize",
                    }}
                  >
                    {role}
                  </button>
                </form>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
