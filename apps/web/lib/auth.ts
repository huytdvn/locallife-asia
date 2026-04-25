import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { audienceFor, type Role, type Session as LLSession } from "@/lib/rbac";
import { getRoleFromDb } from "@/lib/roles";

const ALLOWED_DOMAIN =
  process.env.ALLOWED_EMAIL_DOMAIN ?? "locallife.asia";

const IS_PROD = process.env.NODE_ENV === "production";

function devCredentialsProvider() {
  return Credentials({
    id: "dev",
    name: "Dev bypass",
    credentials: {
      email: { label: "Email" },
      role: { label: "Role" },
    },
    async authorize(creds) {
      if (IS_PROD) return null;
      const role = String(creds?.role ?? "employee") as Role;
      const valid: Role[] = [
        "employee",
        "lead",
        "admin",
        "host",
        "lok",
        "guest",
      ];
      if (!valid.includes(role)) return null;
      // Ignore caller-supplied email to prevent impersonation of real accounts
      // via dev bypass. Use a deterministic synthetic email per role.
      const email = `${role}-dev@${ALLOWED_DOMAIN}`;
      return { id: email, email, name: `Dev (${role})`, role };
    },
  });
}

/**
 * Role resolution order:
 *   1. Dev credentials provider (NODE_ENV != production)
 *   2. DB `roles` table (admin-managed via /admin/users)
 *   3. Env override (`ADMIN_EMAILS` / `LEAD_EMAILS`) — bootstrap-only
 *   4. Default: `guest` (read-only public docs — fail closed)
 *
 * The default is intentionally `guest` (not `employee`) so a brand-new
 * Workspace user that signs in but isn't yet provisioned by an admin
 * cannot read internal documents.
 */
function staticRoleOverride(email: string | null | undefined): Role | null {
  if (!email) return null;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const leads = (process.env.LEAD_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (admins.includes(email)) return "admin";
  if (leads.includes(email)) return "lead";
  return null;
}

async function resolveRole(email: string | null | undefined): Promise<Role> {
  if (!email) return "guest";
  const fromDb = await getRoleFromDb(email);
  if (fromDb) return fromDb;
  return staticRoleOverride(email) ?? "guest";
}

declare module "next-auth" {
  interface Session {
    role: Role;
  }
  interface User {
    role?: Role;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
    ...(IS_PROD ? [] : [devCredentialsProvider()]),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile, account }) {
      // Dev credentials provider bypasses domain check.
      if (account?.provider === "dev") return !IS_PROD;
      const email = profile?.email ?? "";
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return false;
      const hd = (profile as { hd?: string } | null | undefined)?.hd;
      if (hd && hd !== ALLOWED_DOMAIN) return false;
      return true;
    },
    async jwt({ token, user }) {
      // Role staleness — re-resolve from DB at most every ROLE_TTL seconds.
      // Without this, an admin disabling a user via /admin/users only takes
      // effect when the JWT cookie itself expires (default 30 days). With
      // this, max staleness is 5 minutes. For panic-disable (compromised
      // account), rotate NEXTAUTH_SECRET to invalidate all sessions.
      const NOW = Math.floor(Date.now() / 1000);
      const ROLE_TTL = 5 * 60;
      if (user) {
        const devRole = (user as { role?: Role }).role;
        token.role = devRole ?? (await resolveRole(user.email ?? null));
        token.roleCheckedAt = NOW;
      } else {
        const checkedAt = (token.roleCheckedAt as number | undefined) ?? 0;
        if (!token.role || checkedAt + ROLE_TTL < NOW) {
          token.role = await resolveRole(token.email ?? null);
          token.roleCheckedAt = NOW;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.role = (token.role as Role | undefined) ?? "guest";
      return session as DefaultSession & { role: Role };
    },
  },
  pages: {
    signIn: "/login",
  },
});

/**
 * Hợp nhất auth (SSO JWT) + dev fallback. Dùng ở mọi route handler
 * nhạy cảm. Phase 1: header X-Dev-Role được chấp nhận khi NODE_ENV
 * khác "production". Sau Phase 1 prod: chỉ lấy từ session thật.
 */
export async function requireSession(req: Request): Promise<LLSession> {
  if (process.env.NODE_ENV !== "production") {
    const devRole = (req.headers.get("x-dev-role") as Role | null) ?? null;
    const valid: Role[] = [
      "employee",
      "lead",
      "admin",
      "host",
      "lok",
      "guest",
    ];
    if (devRole && valid.includes(devRole)) {
      return {
        email: "dev@locallife.asia",
        role: devRole,
        audience: audienceFor(devRole),
      };
    }
  }

  const session = await auth();
  if (!session?.user?.email) {
    throw new UnauthorizedError("Chưa đăng nhập");
  }
  const email = session.user.email;
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new UnauthorizedError("Email không thuộc domain cho phép");
  }
  const role: Role = session.role ?? "guest";
  return { email, role, audience: audienceFor(role) };
}

export class UnauthorizedError extends Error {}
