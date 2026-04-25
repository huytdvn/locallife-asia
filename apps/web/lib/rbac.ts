/**
 * RBAC model — 2 tier, 6 role, 4 plugin zone.
 *
 * Internal tier (staff Local Life Asia):
 *   - employee: nhân viên thường
 *   - lead: trưởng nhóm (thấy doc của employee + lead)
 *   - admin: full access (thấy tất cả + edit)
 *
 * External tier (đối tác/khách hàng — plugin zones):
 *   - host: chủ homestay / trải nghiệm
 *   - lok: đối tác chương trình LOK
 *   - guest: người dùng public (đã login, tra cứu FAQ/terms)
 *
 * Zones = top-level folder trong knowledge/:
 *   - internal/*   : chỉ staff
 *   - host/*       : host + lead + admin
 *   - lok/*        : lok + lead + admin
 *   - public/*     : mọi role đã login
 */

export type Role =
  | "employee"
  | "lead"
  | "admin"
  | "host"
  | "lok"
  | "guest";

export type Zone = "internal" | "host" | "lok" | "public";

export type Sensitivity = "public" | "internal" | "restricted";

export interface DocMeta {
  id: string;
  title: string;
  owner: string;
  audience: Role[];
  sensitivity: Sensitivity;
  tags: string[];
  last_reviewed: string;
  reviewer: string;
  status: "draft" | "approved" | "deprecated";
  path: string; // relative from knowledge/
}

export interface Session {
  email: string;
  role: Role;
  audience: Role[]; // role + inherited
}

/** Role → danh sách audience kế thừa (role này thấy được audience nào). */
export function audienceFor(role: Role): Role[] {
  switch (role) {
    case "admin":
      return ["employee", "lead", "admin", "host", "lok", "guest"];
    case "lead":
      return ["employee", "lead", "host", "lok", "guest"];
    case "employee":
      return ["employee", "guest"];
    case "host":
      return ["host", "guest"];
    case "lok":
      return ["lok", "guest"];
    case "guest":
      return ["guest"];
  }
}

/** Role → các zone role được phép truy cập. */
export function zonesFor(role: Role): Zone[] {
  switch (role) {
    case "admin":
      return ["internal", "host", "lok", "public"];
    case "lead":
      return ["internal", "host", "lok", "public"];
    case "employee":
      return ["internal", "public"];
    case "host":
      return ["host", "public"];
    case "lok":
      return ["lok", "public"];
    case "guest":
      return ["public"];
  }
}

/** Path → zone (folder top-level). */
export function zoneOf(path: string): Zone {
  const prefix = path.split("/")[0] ?? "";
  if (prefix === "host") return "host";
  if (prefix === "lok") return "lok";
  if (prefix === "public") return "public";
  return "internal"; // mặc định (bao gồm cả legacy paths như "00-company/...")
}

/**
 * Guard đọc: AND tất cả điều kiện.
 *   1. Doc không deprecated.
 *   2. Nếu draft → chỉ lead/admin/owner xem.
 *   3. Zone của doc phải trong zones role được truy cập.
 *   4. Ít nhất 1 role trong doc.audience ∈ audienceFor(role).
 *   5. Sensitivity restricted → chỉ lead/admin.
 */
export function canRead(role: Role, doc: DocMeta): boolean {
  if (doc.status === "deprecated") return false;
  if (doc.status === "draft" && role !== "admin" && role !== "lead") {
    return false;
  }
  const zone = zoneOf(doc.path);
  if (!zonesFor(role).includes(zone)) return false;
  const allowed = audienceFor(role);
  const hasAudience = doc.audience.some((a) => allowed.includes(a));
  if (!hasAudience) return false;
  if (doc.sensitivity === "restricted" && role !== "admin" && role !== "lead") {
    return false;
  }
  return true;
}

/** Chỉ admin ghi trực tiếp. Lead: draft_update (PR). Người khác: không ghi. */
export function canWriteDirect(role: Role): boolean {
  return role === "admin";
}

/** Tất cả role internal được đề xuất draft_update; external không được. */
export function canDraftUpdate(role: Role): boolean {
  return role === "employee" || role === "lead" || role === "admin";
}

/** Internal roles (staff) — tiện ích check UI admin. */
export function isInternal(role: Role): boolean {
  return role === "employee" || role === "lead" || role === "admin";
}

export const ALL_ROLES: Role[] = [
  "employee",
  "lead",
  "admin",
  "host",
  "lok",
  "guest",
];

export const ALL_ZONES: Zone[] = ["internal", "host", "lok", "public"];
