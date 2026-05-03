import { query, isEnabled } from "@/lib/db";
import type { Role } from "@/lib/rbac";
import { getPathsForRole } from "@/lib/training";
import { getProgress } from "@/lib/training-progress";

/**
 * Weekly assignment ties existing training paths (`knowledge/training.json`)
 * to a per-account weekly slot. KHÔNG copy doc — assignment chỉ point tới
 * slug; reuse training-progress + training-quiz cho doc tracking + test.
 *
 * Cron `weekly-rollover` (Mon 07:00 local): với mỗi active account,
 * chọn 1 training path phù hợp role+level mà account chưa pass — nếu
 * chưa có path nào pending, skip (account đã hoàn thành toàn bộ training).
 */

export type AssignmentStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "pending_retry"
  | "failed_pending_review"
  | "passed"
  | "expired"
  | "closed_ok"
  | "closed_supplement";

export type AdminDecision = "ok" | "request_supplement" | "expired";

export interface WeeklyAssignmentRow {
  id: number;
  email: string;
  weekIso: string;
  trainingSlug: string;
  status: AssignmentStatus;
  attemptCount: number;
  lastScore: number | null;
  adminDecision: AdminDecision | null;
  adminEmail: string | null;
  adminDecidedAt: Date | null;
  assignedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  retrySubmittedAt: Date | null;
  closedAt: Date | null;
}

interface RawRow extends Record<string, unknown> {
  id: number;
  email: string;
  week_iso: string;
  training_slug: string;
  status: AssignmentStatus;
  attempt_count: number;
  last_score: number | null;
  admin_decision: AdminDecision | null;
  admin_email: string | null;
  admin_decided_at: Date | null;
  assigned_at: Date;
  started_at: Date | null;
  submitted_at: Date | null;
  retry_submitted_at: Date | null;
  closed_at: Date | null;
}

const COLS = `id, email, week_iso, training_slug, status, attempt_count, last_score,
  admin_decision, admin_email, admin_decided_at, assigned_at, started_at,
  submitted_at, retry_submitted_at, closed_at`;

function map(r: RawRow): WeeklyAssignmentRow {
  return {
    id: r.id,
    email: r.email,
    weekIso: r.week_iso,
    trainingSlug: r.training_slug,
    status: r.status,
    attemptCount: r.attempt_count,
    lastScore: r.last_score,
    adminDecision: r.admin_decision,
    adminEmail: r.admin_email,
    adminDecidedAt: r.admin_decided_at,
    assignedAt: r.assigned_at,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    retrySubmittedAt: r.retry_submitted_at,
    closedAt: r.closed_at,
  };
}

export function isoWeekLabel(d: Date): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function pickPathForAccount(
  email: string,
  role: Role
): Promise<string | null> {
  // Lấy paths phù hợp role; trừ những slug user đã pass quiz.
  const paths = getPathsForRole(role);
  if (paths.length === 0) return null;
  for (const p of paths) {
    const prog = getProgress(email, p.slug);
    if (prog?.quiz?.passed_at) continue;
    return p.slug;
  }
  return null;
}

export async function getCurrentForEmail(
  email: string,
  weekIso: string
): Promise<WeeklyAssignmentRow | null> {
  if (!isEnabled()) return null;
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM weekly_assignment
     WHERE email = $1 AND week_iso = $2
     ORDER BY assigned_at DESC LIMIT 1`,
    [email, weekIso]
  );
  return rows.length === 0 ? null : map(rows[0]);
}

export async function listForEmail(
  email: string,
  limit = 12
): Promise<WeeklyAssignmentRow[]> {
  if (!isEnabled()) return [];
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM weekly_assignment
     WHERE email = $1
     ORDER BY week_iso DESC LIMIT $2`,
    [email, limit]
  );
  return rows.map(map);
}

export async function listPendingForAdmin(): Promise<WeeklyAssignmentRow[]> {
  if (!isEnabled()) return [];
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM weekly_assignment
     WHERE status IN ('submitted','failed_pending_review','passed')
       AND admin_decision IS NULL
     ORDER BY submitted_at DESC NULLS LAST, assigned_at DESC
     LIMIT 100`
  );
  return rows.map(map);
}

export interface CreateInput {
  email: string;
  weekIso: string;
  trainingSlug: string;
}

export async function createAssignment(input: CreateInput): Promise<number> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ id: number }>(
    `INSERT INTO weekly_assignment (email, week_iso, training_slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (email, week_iso, training_slug) DO NOTHING
     RETURNING id`,
    [input.email, input.weekIso, input.trainingSlug]
  );
  return rows[0]?.id ?? -1;
}

export async function setStatus(
  id: number,
  status: AssignmentStatus,
  extra: { score?: number; attemptCount?: number; submittedAt?: Date } = {}
): Promise<void> {
  const sets = ["status = $2"];
  const args: unknown[] = [id, status];
  let p = 2;
  if (extra.score !== undefined) {
    p++;
    sets.push(`last_score = $${p}`);
    args.push(extra.score);
  }
  if (extra.attemptCount !== undefined) {
    p++;
    sets.push(`attempt_count = $${p}`);
    args.push(extra.attemptCount);
  }
  if (extra.submittedAt) {
    p++;
    sets.push(`submitted_at = COALESCE(submitted_at, $${p})`);
    args.push(extra.submittedAt);
    if (extra.attemptCount && extra.attemptCount > 1) {
      p++;
      sets.push(`retry_submitted_at = $${p}`);
      args.push(extra.submittedAt);
    }
  }
  await query(
    `UPDATE weekly_assignment SET ${sets.join(", ")} WHERE id = $1`,
    args
  );
}

export async function adminDecide(
  id: number,
  adminEmail: string,
  decision: AdminDecision
): Promise<void> {
  const closedStatus =
    decision === "ok" ? "closed_ok" :
    decision === "request_supplement" ? "closed_supplement" : "expired";
  await query(
    `UPDATE weekly_assignment
     SET admin_decision = $2, admin_email = $3, admin_decided_at = now(),
         status = $4, closed_at = now()
     WHERE id = $1`,
    [id, decision, adminEmail, closedStatus]
  );
}
