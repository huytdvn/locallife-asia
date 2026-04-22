import { audienceFor, type Session, type Role } from "@/lib/rbac";

/**
 * Phase 0: stub. Phase 1 sẽ thay bằng NextAuth + Google Workspace SSO:
 *   - Provider: Google, hostedDomain = locallife.asia
 *   - JWT chứa role (mặc định "employee")
 *   - Role elevation đồng bộ từ Google Group qua job định kỳ
 */
export async function requireSession(req: Request): Promise<Session> {
  void req;

  if (process.env.NODE_ENV !== "production") {
    // Dev: impersonate qua header X-Dev-Role (employee | lead | admin)
    const devRole = (req.headers.get("x-dev-role") as Role) ?? "employee";
    return {
      email: "dev@locallife.asia",
      role: devRole,
      audience: audienceFor(devRole),
    };
  }

  throw new Error("requireSession: chưa implement production auth (Phase 1)");
}
