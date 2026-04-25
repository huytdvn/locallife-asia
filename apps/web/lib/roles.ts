/**
 * DB-backed role registry. Replaces / supplements the env-only role override.
 *
 * Resolution order (auth.ts JWT callback):
 *   1. Dev credentials provider (NODE_ENV != production) — role from header
 *   2. DB `roles` table (this module)
 *   3. Env override (`ADMIN_EMAILS` / `LEAD_EMAILS`) — kept for bootstrap
 *   4. Default: `guest` (read-only public docs)
 *
 * The default changed from `employee` to `guest` to fail-closed: a new
 * Workspace user signing in cannot read internal docs until an admin
 * provisions them via /admin/users.
 */

import { isEnabled, query } from "@/lib/db";
import type { Role } from "@/lib/rbac";

export interface RoleRow extends Record<string, unknown> {
  email: string;
  role: Role;
  disabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const ALL_ROLES: Role[] = [
  "employee",
  "lead",
  "admin",
  "host",
  "lok",
  "guest",
];

/**
 * Roles an admin can assign through `/admin/users`.
 * - host & lok: NOT here. Those identities live in back-office; the widget
 *   synthesises a Session at request time from an HMAC token. Storing them
 *   in our DB would just be a stale mirror.
 * - guest: NOT here. It's the implicit default for any signed-in Workspace
 *   user not in the table — used as a "denied" state, not assigned.
 */
export const INTERNAL_ROLES: Role[] = ["employee", "lead", "admin"];

export function isValidRole(s: string): s is Role {
  return (ALL_ROLES as string[]).includes(s);
}

export function isAssignableRole(s: string): s is Role {
  return (INTERNAL_ROLES as string[]).includes(s);
}

/** Lookup a single user's active role. Returns null if disabled or missing. */
export async function getRoleFromDb(email: string): Promise<Role | null> {
  if (!isEnabled()) return null;
  try {
    const rows = await query<{ role: Role; disabled: boolean }>(
      "SELECT role, disabled FROM roles WHERE email = $1",
      [email]
    );
    const row = rows[0];
    if (!row || row.disabled) return null;
    return row.role;
  } catch (err) {
    console.warn("[roles] getRoleFromDb failed:", err);
    return null;
  }
}

export interface ListRolesResult {
  rows: RoleRow[];
  /** Reason rows is empty: 'no-db' | 'db-error' | 'empty' | 'ok'. */
  status: "no-db" | "db-error" | "empty" | "ok";
  errorMessage?: string;
}

/** Admin UI: list every user. Never throws — returns status flag instead. */
export async function listRoles(): Promise<ListRolesResult> {
  if (!isEnabled()) return { rows: [], status: "no-db" };
  try {
    const rows = await query<RoleRow>(
      `SELECT email, role, disabled, created_by,
              created_at::text AS created_at,
              updated_at::text AS updated_at
         FROM roles
         ORDER BY disabled ASC, role, email`
    );
    return { rows, status: rows.length === 0 ? "empty" : "ok" };
  } catch (err) {
    return {
      rows: [],
      status: "db-error",
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Admin UI: provision or re-activate a user. */
export async function upsertRole(params: {
  email: string;
  role: Role;
  createdBy: string;
}): Promise<void> {
  if (!isEnabled()) {
    throw new Error("DATABASE_URL chưa set — không thể quản lý role");
  }
  await query(
    `INSERT INTO roles (email, role, disabled, created_by)
       VALUES ($1, $2, false, $3)
     ON CONFLICT (email) DO UPDATE SET
       role = EXCLUDED.role,
       disabled = false,
       updated_at = now()`,
    [params.email.toLowerCase(), params.role, params.createdBy]
  );
}

/** Admin UI: soft-disable. We never DELETE — preserves audit trail. */
export async function disableRole(email: string): Promise<void> {
  if (!isEnabled()) {
    throw new Error("DATABASE_URL chưa set");
  }
  await query(
    "UPDATE roles SET disabled = true, updated_at = now() WHERE email = $1",
    [email.toLowerCase()]
  );
}
