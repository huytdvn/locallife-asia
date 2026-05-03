import { query, isEnabled } from "@/lib/db";

export type CreatedByRole = "admin" | "lead";
export type KnowledgeTaskStatus =
  | "pending"
  | "drafting"
  | "pr_open"
  | "merged"
  | "ingested"
  | "assigned";
export type Audience = "host" | "employee" | "lead" | "admin";
export type Level = "entry" | "mid" | "senior";

export interface KnowledgeTaskRow {
  id: number;
  createdByEmail: string;
  createdByRole: CreatedByRole;
  topic: string;
  audience: Audience[];
  level: Level | null;
  deadline: Date;
  levelBased: boolean;
  status: KnowledgeTaskStatus;
  relatedAssignmentId: number | null;
  prUrl: string | null;
  draftingStartedAt: Date | null;
  prOpenedAt: Date | null;
  mergedAt: Date | null;
  ingestedAt: Date | null;
  escalatedAt: Date | null;
  escalatedToEmail: string | null;
  notes: string | null;
  createdAt: Date;
}

interface RawRow extends Record<string, unknown> {
  id: number;
  created_by_email: string;
  created_by_role: CreatedByRole;
  topic: string;
  audience: Audience[];
  level: Level | null;
  deadline: Date;
  level_based: boolean;
  status: KnowledgeTaskStatus;
  related_assignment_id: number | null;
  pr_url: string | null;
  drafting_started_at: Date | null;
  pr_opened_at: Date | null;
  merged_at: Date | null;
  ingested_at: Date | null;
  escalated_at: Date | null;
  escalated_to_email: string | null;
  notes: string | null;
  created_at: Date;
}

const COLS = `id, created_by_email, created_by_role, topic, audience, level,
  deadline, level_based, status, related_assignment_id, pr_url,
  drafting_started_at, pr_opened_at, merged_at, ingested_at, escalated_at,
  escalated_to_email, notes, created_at`;

function map(r: RawRow): KnowledgeTaskRow {
  return {
    id: r.id,
    createdByEmail: r.created_by_email,
    createdByRole: r.created_by_role,
    topic: r.topic,
    audience: r.audience,
    level: r.level,
    deadline: r.deadline,
    levelBased: r.level_based,
    status: r.status,
    relatedAssignmentId: r.related_assignment_id,
    prUrl: r.pr_url,
    draftingStartedAt: r.drafting_started_at,
    prOpenedAt: r.pr_opened_at,
    mergedAt: r.merged_at,
    ingestedAt: r.ingested_at,
    escalatedAt: r.escalated_at,
    escalatedToEmail: r.escalated_to_email,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export interface CreateInput {
  createdByEmail: string;
  createdByRole: CreatedByRole;
  topic: string;
  audience: Audience[];
  level?: Level;
  deadlineDays: number;
  levelBased: boolean;
  relatedAssignmentId?: number;
  notes?: string;
}

export async function createKnowledgeTask(input: CreateInput): Promise<number> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + input.deadlineDays);
  const rows = await query<{ id: number }>(
    `INSERT INTO knowledge_task
       (created_by_email, created_by_role, topic, audience, level, deadline,
        level_based, related_assignment_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      input.createdByEmail,
      input.createdByRole,
      input.topic,
      input.audience,
      input.level ?? null,
      deadline,
      input.levelBased,
      input.relatedAssignmentId ?? null,
      input.notes ?? null,
    ]
  );
  return rows[0].id;
}

export async function getById(id: number): Promise<KnowledgeTaskRow | null> {
  if (!isEnabled()) return null;
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM knowledge_task WHERE id = $1`,
    [id]
  );
  return rows.length === 0 ? null : map(rows[0]);
}

export async function listForUser(
  email: string,
  isAdmin: boolean
): Promise<KnowledgeTaskRow[]> {
  if (!isEnabled()) return [];
  if (isAdmin) {
    const rows = await query<RawRow>(
      `SELECT ${COLS} FROM knowledge_task ORDER BY created_at DESC LIMIT 100`
    );
    return rows.map(map);
  }
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM knowledge_task
     WHERE created_by_email = $1 ORDER BY created_at DESC LIMIT 100`,
    [email]
  );
  return rows.map(map);
}

export async function listOverdue(now: Date): Promise<KnowledgeTaskRow[]> {
  if (!isEnabled()) return [];
  const rows = await query<RawRow>(
    `SELECT ${COLS} FROM knowledge_task
     WHERE deadline < $1
       AND status NOT IN ('merged','ingested','assigned')
       AND escalated_at IS NULL
     ORDER BY deadline ASC`,
    [now]
  );
  return rows.map(map);
}

export async function setStatus(
  id: number,
  status: KnowledgeTaskStatus,
  extra: { prUrl?: string; mergedAt?: Date } = {}
): Promise<void> {
  const sets = ["status = $2"];
  const args: unknown[] = [id, status];
  let p = 2;
  if (status === "drafting") {
    sets.push(`drafting_started_at = COALESCE(drafting_started_at, now())`);
  }
  if (status === "pr_open") {
    sets.push(`pr_opened_at = COALESCE(pr_opened_at, now())`);
  }
  if (status === "merged") {
    p++;
    sets.push(`merged_at = $${p}`);
    args.push(extra.mergedAt ?? new Date());
  }
  if (status === "ingested") {
    sets.push(`ingested_at = now()`);
  }
  if (extra.prUrl !== undefined) {
    p++;
    sets.push(`pr_url = $${p}`);
    args.push(extra.prUrl);
  }
  await query(
    `UPDATE knowledge_task SET ${sets.join(", ")} WHERE id = $1`,
    args
  );
}

export async function escalate(
  id: number,
  toEmail: string,
  notes?: string
): Promise<void> {
  await query(
    `UPDATE knowledge_task
     SET escalated_at = now(),
         escalated_to_email = $2,
         notes = COALESCE($3, notes)
     WHERE id = $1`,
    [id, toEmail, notes ?? null]
  );
}
