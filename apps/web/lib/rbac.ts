export type Role = "employee" | "lead" | "admin";
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
  audience: Role[]; // role + inherited (employee ⊂ lead ⊂ admin)
}

export function audienceFor(role: Role): Role[] {
  switch (role) {
    case "admin":
      return ["employee", "lead", "admin"];
    case "lead":
      return ["employee", "lead"];
    case "employee":
      return ["employee"];
  }
}

/**
 * Core guard: có được xem doc này với role hiện tại không?
 * Gọi trước khi đưa doc vào context hoặc trả content ra user.
 */
export function canRead(role: Role, doc: DocMeta): boolean {
  if (doc.status === "deprecated") return false;
  if (doc.status === "draft" && role === "employee") return false;
  // Audience check: ít nhất 1 role user có mặt trong audience của doc
  const allowed = audienceFor(role);
  const hasAudience = doc.audience.some((a) => allowed.includes(a));
  if (!hasAudience) return false;
  // Sensitivity gate
  if (doc.sensitivity === "restricted" && role === "employee") return false;
  return true;
}

export function canWriteDirect(role: Role): boolean {
  return role === "admin";
}

export function canDraftUpdate(_role: Role): boolean {
  return true;
}
