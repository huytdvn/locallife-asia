import { query, isEnabled } from "@/lib/db";
import { buildAdhocPath } from "@/lib/training";
import type { TrainingPath } from "@/lib/training";
import type { Role } from "@/lib/rbac";
import { getById as getKnowledgeTaskById } from "@/lib/onboarding/knowledge-task";

/**
 * Ad-hoc training path resolver — `slug = "kt:<n>"` → 1-doc training course
 * sinh từ knowledge_task #N. Tách module riêng vì training.ts giữ sync API
 * (không async, no DB), còn knowledge_task lookup cần Postgres.
 */

const KT_PREFIX = "kt:";

export function isAdhocSlug(slug: string): boolean {
  return slug.startsWith(KT_PREFIX);
}

export function adhocSlugFor(taskId: number | string): string {
  return `${KT_PREFIX}${taskId}`;
}

export function parseAdhocSlug(slug: string): number | null {
  if (!isAdhocSlug(slug)) return null;
  const n = Number(slug.slice(KT_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Resolve `kt:N` slug thành TrainingPath. Đọc knowledge_task.id=N từ DB,
 * lookup doc đã save (qua related path đã commit), build adhoc path.
 *
 * Relies on convention: save-draft endpoint stores the doc path in
 * knowledge_task.notes hoặc trong field riêng. Để không thay schema, em
 * lưu path vào `notes` với prefix `[saved-doc-path]` — defer cleaner field.
 */
export async function resolveAdhocPath(
  slug: string,
  role: Role
): Promise<TrainingPath | null> {
  const taskId = parseAdhocSlug(slug);
  if (taskId === null) return null;
  const task = await getKnowledgeTaskById(taskId);
  if (!task) return null;
  const docPath = extractSavedDocPath(task.notes);
  if (!docPath) return null;

  // RBAC: role phải nằm trong audience của task. `role` rộng hơn (Role =
  // {employee,lead,admin,host,lok,guest}) còn audience chỉ subset → cast
  // thành string compare.
  if (
    role !== "admin" &&
    !(task.audience as string[]).includes(role)
  ) {
    return null;
  }

  return buildAdhocPath({
    slug,
    title: task.topic,
    docPath,
    forRoles: task.audience as Role[],
  });
}

const SAVED_DOC_TAG = "[saved-doc-path]";

export function tagSavedDocPath(notes: string | null, docPath: string): string {
  // doc_path expected là path tương đối với knowledge root (không có prefix
  // "knowledge/"). Strip nếu có.
  const rel = docPath.replace(/^knowledge\//, "");
  const tag = `${SAVED_DOC_TAG} ${rel}`;
  if (!notes || notes.trim().length === 0) return tag;
  // Nếu đã có tag cũ, replace
  const stripped = notes.replace(/\[saved-doc-path\][^\n]*/g, "").trim();
  return stripped ? `${stripped}\n${tag}` : tag;
}

function extractSavedDocPath(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[saved-doc-path\]\s+(\S+)/);
  return m ? m[1] : null;
}

/**
 * Khi save-draft xong: tạo `weekly_assignment` cho mọi active account có
 * role thuộc `audience` của task. Idempotent qua unique
 * (email, week_iso, training_slug).
 */
export async function spawnAdhocAssignments(
  taskId: number,
  audience: string[],
  weekIso: string
): Promise<{ created: number; emails: string[] }> {
  if (!isEnabled()) return { created: 0, emails: [] };

  // Filter audience xuống các role có thể nhận onboarding (employee/lead).
  const onboardingRoles = audience.filter((a) => a === "employee" || a === "lead");
  if (onboardingRoles.length === 0) return { created: 0, emails: [] };

  const accounts = await query<{ email: string }>(
    `SELECT r.email
     FROM roles r
     INNER JOIN account_extras ae ON ae.email = r.email
     WHERE ae.onboarding_bot_enabled = true
       AND r.disabled = false
       AND r.role = ANY($1::text[])`,
    [onboardingRoles]
  );

  const slug = adhocSlugFor(taskId);
  let created = 0;
  const emails: string[] = [];
  for (const acc of accounts) {
    const rows = await query<{ id: number }>(
      `INSERT INTO weekly_assignment (email, week_iso, training_slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (email, week_iso, training_slug) DO NOTHING
       RETURNING id`,
      [acc.email, weekIso, slug]
    );
    if (rows.length > 0) {
      created++;
      emails.push(acc.email);
    }
  }
  return { created, emails };
}
