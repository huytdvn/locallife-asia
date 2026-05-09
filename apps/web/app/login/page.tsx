import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export const dynamic = "force-dynamic";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Auth.js v5 throws on `signIn()`:
 *   - success → throws NEXT_REDIRECT (via internal redirect()) — must be re-thrown
 *   - bad credentials → throws CredentialsSignin (subclass of AuthError)
 *   - other auth issues → throws AuthError of various types
 *
 * Without this wrapper the AuthError bubbles to the page render and the
 * user gets the generic "Application error: a server-side exception".
 * Wrap, classify, and redirect back to /login with `?error=<type>` so the
 * existing inline error banner in this page can show a friendly message.
 */
async function signInOrRedirectWithError(
  provider: Parameters<typeof signIn>[0],
  options: Parameters<typeof signIn>[1],
  nextPath: string
): Promise<never> {
  try {
    await signIn(provider, options);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof AuthError) {
      const params = new URLSearchParams({ error: err.type, next: nextPath });
      redirect(`/login?${params.toString()}`);
    }
    throw err;
  }
  // signIn always either redirects (success) or throws — we never reach here.
  throw new Error("unreachable");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next ?? "/";
  const authError = params.error;

  return (
    <main
      className="ll-login-shell"
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
        className="ll-anim-in ll-login-card"
        style={{
          background: "var(--ll-surface)",
          padding: 32,
          borderRadius: "var(--ll-radius-lg)",
          border: "1px solid var(--ll-border)",
          boxShadow: "var(--ll-shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          width: "100%",
          maxWidth: 440,
        }}
      >
        <div
          className="ll-login-mascot"
          style={{
            width: 84,
            height: 112,
            marginBottom: 4,
            filter: "drop-shadow(0 6px 12px rgba(22,163,74,0.18))",
          }}
        >
          {/* mascot 3:4 — never force square */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot.webp"
            alt="Bé Tre"
            width={84}
            height={112}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
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

        {authError && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            {authError === "CredentialsSignin"
              ? "Email hoặc mật khẩu không đúng. Liên hệ admin nếu quên mật khẩu."
              : authError === "OTP_REQUIRED"
                ? "Tài khoản này đã bật OTP — nhập mã 6 số từ Authenticator vào ô bên dưới rồi gửi lại."
                : authError === "OTP_INVALID"
                  ? "Mã OTP sai hoặc hết hạn. Lấy mã mới từ Authenticator (đổi mỗi 30 giây) rồi thử lại."
                  : `Đăng nhập thất bại: ${authError}`}
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signInOrRedirectWithError(
              "google",
              { redirectTo: nextPath },
              nextPath
            );
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

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--ll-muted)",
            fontSize: 12,
            margin: "4px 0",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--ll-border)" }} />
          HOẶC
          <span style={{ flex: 1, height: 1, background: "var(--ll-border)" }} />
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            const email = String(formData.get("email") ?? "").trim();
            const password = String(formData.get("password") ?? "");
            const otp = String(formData.get("otp") ?? "").trim();
            await signInOrRedirectWithError(
              "password",
              { email, password, otp, redirectTo: nextPath },
              nextPath
            );
          }}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            name="email"
            type="email"
            required
            placeholder="email@công-ty.tld"
            autoComplete="username"
            style={inputStyle}
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Mật khẩu (≥10 ký tự)"
            autoComplete="current-password"
            style={inputStyle}
          />
          <input
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="Mã OTP (6 số) — bỏ trống nếu chưa kích hoạt"
            style={{
              ...inputStyle,
              fontFamily: "ui-monospace, monospace",
              letterSpacing: "0.2em",
            }}
            defaultValue=""
          />
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--ll-green)",
              background: "white",
              color: "var(--ll-green-dark)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Đăng nhập bằng email + mật khẩu
          </button>
          <p style={{ margin: 0, fontSize: 11, color: "var(--ll-muted)", textAlign: "center" }}>
            Dành cho user nội bộ không có Google Workspace. Quên password? Liên hệ admin.
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
                    await signInOrRedirectWithError(
                      "dev",
                      { role, redirectTo: nextPath },
                      nextPath
                    );
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--ll-border)",
  fontSize: 14,
  fontFamily: "inherit",
  background: "white",
  boxSizing: "border-box",
};
