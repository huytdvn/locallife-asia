/**
 * DB persistence cho admin builders. Tách ra khỏi route handler để
 * dễ test + tái dùng. Tất cả query bọc trong transaction nơi cần.
 */

import { query, isEnabled, getPool } from "@/lib/db";
import type {
  OnboardingFlowDraft,
  OnboardingStepDraft,
  TrainingQuizDraft,
} from "@/lib/admin-builders/ai";
import { audienceFor, type Role } from "@/lib/rbac";

// ────────────────────────────────────────────────────────────────────
// Onboarding flow
// ────────────────────────────────────────────────────────────────────

export interface SavedOnboardingFlow {
  id: number;
  title: string;
  motto: string | null;
  pass_threshold: number;
  status: "draft" | "published" | "archived";
  created_by: string;
  created_at: string;
  step_count: number;
}

export async function saveOnboardingFlow(params: {
  draft: OnboardingFlowDraft;
  brief: string | null;
  createdBy: string;
}): Promise<{ id: number }> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const flow = await client.query<{ id: number }>(
      `INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING id`,
      [
        params.draft.title,
        params.draft.motto || null,
        params.brief,
        params.createdBy,
        params.draft.pass_threshold,
      ]
    );
    const flowId = flow.rows[0].id;

    for (let i = 0; i < params.draft.steps.length; i++) {
      const step = params.draft.steps[i];
      const stepRes = await client.query<{ id: number }>(
        `INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [flowId, i, step.goal, step.intro, step.pass_criteria]
      );
      const stepId = stepRes.rows[0].id;
      for (const d of step.docs) {
        await client.query(
          `INSERT INTO onboarding_step_doc (step_id, doc_path, heading_anchor, highlight, reason)
           VALUES ($1, $2, $3, $4, $5)`,
          [stepId, d.doc_path, d.heading_anchor, d.highlight, d.reason]
        );
      }
      for (const q of step.questions) {
        await client.query(
          `INSERT INTO onboarding_step_question (step_id, prompt, expected_keywords, min_keywords)
           VALUES ($1, $2, $3, $4)`,
          [stepId, q.prompt, q.expected_keywords, q.min_keywords]
        );
      }
    }
    await client.query("COMMIT");
    return { id: flowId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listOnboardingFlows(): Promise<SavedOnboardingFlow[]> {
  if (!isEnabled()) return [];
  const rows = await query<{
    id: number;
    title: string;
    motto: string | null;
    pass_threshold: number;
    status: "draft" | "published" | "archived";
    created_by: string;
    created_at: string;
    step_count: string | number;
  }>(
    `SELECT f.id, f.title, f.motto, f.pass_threshold, f.status, f.created_by,
            f.created_at::text AS created_at,
            (SELECT count(*) FROM onboarding_step s WHERE s.flow_id = f.id) AS step_count
     FROM onboarding_flow f
     WHERE f.status <> 'archived'
     ORDER BY f.created_at DESC`,
    []
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    motto: r.motto,
    pass_threshold: r.pass_threshold,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    step_count: Number(r.step_count),
  }));
}

export interface FullOnboardingFlow {
  id: number;
  title: string;
  motto: string | null;
  brief: string | null;
  status: "draft" | "published" | "archived";
  pass_threshold: number;
  steps: Array<{
    id: number;
    idx: number;
    goal: string;
    intro: string | null;
    pass_criteria: string | null;
    docs: Array<{
      id: number;
      doc_path: string;
      heading_anchor: string | null;
      highlight: string | null;
      reason: string | null;
    }>;
    questions: Array<{
      id: number;
      prompt: string;
      expected_keywords: string[];
      min_keywords: number;
    }>;
  }>;
}

export async function getOnboardingFlow(
  id: number
): Promise<FullOnboardingFlow | null> {
  if (!isEnabled()) return null;
  const flowRows = await query<{
    id: number;
    title: string;
    motto: string | null;
    brief: string | null;
    status: "draft" | "published" | "archived";
    pass_threshold: number;
  }>(
    `SELECT id, title, motto, brief, status, pass_threshold
     FROM onboarding_flow WHERE id = $1`,
    [id]
  );
  if (flowRows.length === 0) return null;
  const flow = flowRows[0];

  const stepRows = await query<{
    id: number;
    idx: number;
    goal: string;
    intro: string | null;
    pass_criteria: string | null;
  }>(
    `SELECT id, idx, goal, intro, pass_criteria
     FROM onboarding_step WHERE flow_id = $1 ORDER BY idx`,
    [id]
  );
  const stepIds = stepRows.map((s) => s.id);

  const docRows = stepIds.length
    ? await query<{
        id: number;
        step_id: number;
        doc_path: string;
        heading_anchor: string | null;
        highlight: string | null;
        reason: string | null;
      }>(
        `SELECT id, step_id, doc_path, heading_anchor, highlight, reason
         FROM onboarding_step_doc WHERE step_id = ANY($1::bigint[]) ORDER BY id`,
        [stepIds]
      )
    : [];

  const qRows = stepIds.length
    ? await query<{
        id: number;
        step_id: number;
        prompt: string;
        expected_keywords: string[];
        min_keywords: number;
      }>(
        `SELECT id, step_id, prompt, expected_keywords, min_keywords
         FROM onboarding_step_question WHERE step_id = ANY($1::bigint[]) ORDER BY id`,
        [stepIds]
      )
    : [];

  return {
    ...flow,
    steps: stepRows.map((s) => ({
      ...s,
      docs: docRows.filter((d) => d.step_id === s.id).map((d) => ({
        id: d.id,
        doc_path: d.doc_path,
        heading_anchor: d.heading_anchor,
        highlight: d.highlight,
        reason: d.reason,
      })),
      questions: qRows.filter((q) => q.step_id === s.id).map((q) => ({
        id: q.id,
        prompt: q.prompt,
        expected_keywords: q.expected_keywords ?? [],
        min_keywords: q.min_keywords,
      })),
    })),
  };
}

export async function deleteOnboardingFlow(id: number): Promise<boolean> {
  if (!isEnabled()) return false;
  // CASCADE xoá step + step_doc + step_question + assignment + attempt
  const rows = await query<{ id: number }>(
    `DELETE FROM onboarding_flow WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function deleteTrainingQuiz(id: number): Promise<boolean> {
  if (!isEnabled()) return false;
  const rows = await query<{ id: number }>(
    `DELETE FROM training_quiz WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function publishOnboardingFlow(id: number): Promise<boolean> {
  if (!isEnabled()) return false;
  const rows = await query<{ id: number }>(
    `UPDATE onboarding_flow SET status='published', updated_at=now()
     WHERE id=$1 AND status='draft' RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

export async function assignOnboardingFlow(params: {
  flowId: number;
  targetEmails: string[];
  targetRoles: Role[];
  assignedBy: string;
}): Promise<{ created: number }> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  let created = 0;
  for (const email of params.targetEmails) {
    const r = await query<{ id: number }>(
      `INSERT INTO onboarding_assignment (flow_id, target_email, assigned_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [params.flowId, email.toLowerCase(), params.assignedBy]
    );
    created += r.length;
  }
  for (const role of params.targetRoles) {
    const r = await query<{ id: number }>(
      `INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
       VALUES ($1, $2, $3) RETURNING id`,
      [params.flowId, role, params.assignedBy]
    );
    created += r.length;
  }
  return { created };
}

// ────────────────────────────────────────────────────────────────────
// Training quiz
// ────────────────────────────────────────────────────────────────────

export interface SavedTrainingQuiz {
  id: number;
  title: string;
  motto: string | null;
  audience: Role[];
  doc_paths: string[];
  pass_threshold: number;
  format: "quiz" | "reading" | "flashcard";
  status: "draft" | "published" | "archived";
  created_by: string;
  created_at: string;
  question_count: number;
}

export async function saveTrainingQuiz(params: {
  draft: TrainingQuizDraft;
  audience: Role[];
  docPaths: string[];
  format: "quiz" | "reading" | "flashcard";
  createdBy: string;
}): Promise<{ id: number }> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ id: number }>(
    `INSERT INTO training_quiz
       (title, motto, intro, audience, doc_paths, questions, pass_threshold,
        format, created_by, status)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, 'draft')
     RETURNING id`,
    [
      params.draft.title,
      params.draft.motto || null,
      params.draft.intro || null,
      params.audience,
      params.docPaths,
      JSON.stringify(params.draft.questions),
      params.draft.pass_threshold,
      params.format,
      params.createdBy,
    ]
  );
  return { id: rows[0].id };
}

export async function listTrainingQuizzes(): Promise<SavedTrainingQuiz[]> {
  if (!isEnabled()) return [];
  const rows = await query<{
    id: number;
    title: string;
    motto: string | null;
    audience: Role[];
    doc_paths: string[];
    pass_threshold: number;
    format: "quiz" | "reading" | "flashcard";
    status: "draft" | "published" | "archived";
    created_by: string;
    created_at: string;
    question_count: string | number;
  }>(
    `SELECT id, title, motto, audience, doc_paths, pass_threshold, format,
            status, created_by, created_at::text AS created_at,
            jsonb_array_length(questions) AS question_count
     FROM training_quiz
     WHERE status <> 'archived'
     ORDER BY created_at DESC`,
    []
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    motto: r.motto,
    audience: r.audience ?? [],
    doc_paths: r.doc_paths ?? [],
    pass_threshold: r.pass_threshold,
    format: r.format,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    question_count: Number(r.question_count ?? 0),
  }));
}

// ────────────────────────────────────────────────────────────────────
// User-facing helpers — list assigned + full + record attempts
// ────────────────────────────────────────────────────────────────────

/**
 * Trả về list flow đã assigned cho `email` HOẶC role của họ. Một flow chỉ
 * xuất hiện 1 lần kể cả nếu cả 2 dạng assignment match.
 */
export async function listAssignedFlowsForUser(
  email: string,
  role: Role
): Promise<SavedOnboardingFlow[]> {
  if (!isEnabled()) return [];
  const rows = await query<{
    id: number;
    title: string;
    motto: string | null;
    pass_threshold: number;
    status: "draft" | "published" | "archived";
    created_by: string;
    created_at: string;
    step_count: string | number;
  }>(
    // admin/lead xem được mọi flow published (preview/QA); user thường chỉ
    // thấy flow đã được giao đích danh hoặc broadcast role.
    role === "admin" || role === "lead"
      ? `SELECT f.id, f.title, f.motto, f.pass_threshold, f.status, f.created_by,
                f.created_at::text AS created_at,
                (SELECT count(*) FROM onboarding_step s WHERE s.flow_id = f.id) AS step_count
         FROM onboarding_flow f
         WHERE f.status = 'published'
         ORDER BY f.created_at DESC`
      : `SELECT f.id, f.title, f.motto, f.pass_threshold, f.status, f.created_by,
                f.created_at::text AS created_at,
                (SELECT count(*) FROM onboarding_step s WHERE s.flow_id = f.id) AS step_count
         FROM onboarding_flow f
         WHERE f.status = 'published'
           AND EXISTS (
             SELECT 1 FROM onboarding_assignment a
             WHERE a.flow_id = f.id
               AND (a.target_email = $1 OR a.target_role = $2)
           )
         ORDER BY f.created_at DESC`,
    role === "admin" || role === "lead" ? [] : [email.toLowerCase(), role]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    motto: r.motto,
    pass_threshold: r.pass_threshold,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    step_count: Number(r.step_count),
  }));
}

/** Quick check user có được assigned flow này không. */
export async function userIsAssignedToFlow(
  email: string,
  role: Role,
  flowId: number
): Promise<boolean> {
  if (!isEnabled()) return false;
  const rows = await query<{ id: number }>(
    `SELECT id FROM onboarding_assignment
     WHERE flow_id = $1 AND (target_email = $2 OR target_role = $3)
     LIMIT 1`,
    [flowId, email.toLowerCase(), role]
  );
  return rows.length > 0;
}

export interface FlowAttemptResult {
  attempt_id: number;
  passed: boolean;
  score_pct: number;
  step_results: Array<{
    step_id: number;
    score_pct: number;
    passed: boolean;
  }>;
}

export async function recordFlowAttempt(params: {
  flowId: number;
  email: string;
  passed: boolean;
  scorePct: number;
  stepResults: FlowAttemptResult["step_results"];
}): Promise<{ id: number }> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ id: number }>(
    `INSERT INTO onboarding_flow_attempt
       (flow_id, email, passed, score_pct, step_results)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING id`,
    [
      params.flowId,
      params.email.toLowerCase(),
      params.passed,
      params.scorePct,
      JSON.stringify(params.stepResults),
    ]
  );
  return { id: rows[0].id };
}

/** List quiz mà user có thể làm dựa trên audience của role + roles kế thừa
 *  (admin/lead xem được mọi audience). */
export async function listQuizzesForRole(
  role: Role
): Promise<SavedTrainingQuiz[]> {
  if (!isEnabled()) return [];
  const inherited = audienceFor(role);
  const rows = await query<{
    id: number;
    title: string;
    motto: string | null;
    audience: Role[];
    doc_paths: string[];
    pass_threshold: number;
    format: "quiz" | "reading" | "flashcard";
    status: "draft" | "published" | "archived";
    created_by: string;
    created_at: string;
    question_count: string | number;
  }>(
    `SELECT id, title, motto, audience, doc_paths, pass_threshold, format,
            status, created_by, created_at::text AS created_at,
            jsonb_array_length(questions) AS question_count
     FROM training_quiz
     WHERE status = 'published' AND audience && $1::text[]
     ORDER BY created_at DESC`,
    [inherited]
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    motto: r.motto,
    audience: r.audience ?? [],
    doc_paths: r.doc_paths ?? [],
    pass_threshold: r.pass_threshold,
    format: r.format,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at,
    question_count: Number(r.question_count ?? 0),
  }));
}

export interface FullTrainingQuiz {
  id: number;
  title: string;
  motto: string | null;
  intro: string | null;
  audience: Role[];
  doc_paths: string[];
  pass_threshold: number;
  format: "quiz" | "reading" | "flashcard";
  /** Public version — KHÔNG kèm answer_idx + explanation. */
  questions_public: Array<{
    id: string;
    prompt: string;
    choices: string[];
  }>;
  /** Server-side full — chỉ trả khi user đã làm xong / admin xem. */
  questions_full?: Array<{
    id: string;
    prompt: string;
    choices: string[];
    answer_idx: number;
    explanation: string;
  }>;
}

export async function getQuizForUser(
  id: number,
  role: Role
): Promise<FullTrainingQuiz | null> {
  if (!isEnabled()) return null;
  const inherited = audienceFor(role);
  const rows = await query<{
    id: number;
    title: string;
    motto: string | null;
    intro: string | null;
    audience: Role[];
    doc_paths: string[];
    pass_threshold: number;
    format: "quiz" | "reading" | "flashcard";
    questions: Array<{
      id: string;
      prompt: string;
      choices: string[];
      answer_idx: number;
      explanation: string;
    }>;
  }>(
    `SELECT id, title, motto, intro, audience, doc_paths, pass_threshold, format, questions
     FROM training_quiz
     WHERE id = $1 AND status = 'published' AND audience && $2::text[]`,
    [id, inherited]
  );
  if (rows.length === 0) return null;
  const q = rows[0];
  return {
    id: q.id,
    title: q.title,
    motto: q.motto,
    intro: q.intro,
    audience: q.audience ?? [],
    doc_paths: q.doc_paths ?? [],
    pass_threshold: q.pass_threshold,
    format: q.format,
    questions_public: (q.questions ?? []).map((qq) => ({
      id: qq.id,
      prompt: qq.prompt,
      choices: qq.choices,
    })),
  };
}

/**
 * Analytics cho admin listing — group quiz theo audience role + thống kê
 * users trong từng nhóm: bao nhiêu active, bao nhiêu đã pass, last online
 * (max ts trong audit_log của email đó).
 *
 * Nhằm trả lời câu hỏi của admin: "Quiz này áp dụng cho ai, ai chưa làm,
 * và bây giờ có thể nudge ai (ai online gần đây)?"
 */
export interface QuizGroupAnalytics {
  audience_role: Role;
  active_users: number;
  attempted: number;
  passed: number;
  /** ISO date string của lần online gần nhất across users trong audience. */
  most_recent_online: string | null;
  /** Median (xấp xỉ) "online time of day" — hour-of-day mean. NULL nếu chưa có data. */
  typical_online_hour: number | null;
}

export async function quizAudienceAnalytics(
  quizId: number,
  audience: Role[]
): Promise<QuizGroupAnalytics[]> {
  if (!isEnabled() || audience.length === 0) return [];
  const rows = await query<{
    audience_role: Role;
    active_users: string | number;
    attempted: string | number;
    passed: string | number;
    most_recent_online: string | null;
    typical_online_hour: string | number | null;
  }>(
    `WITH role_users AS (
       SELECT email, role FROM roles
       WHERE NOT disabled AND role = ANY($2::text[])
     ),
     attempts AS (
       SELECT email, BOOL_OR(passed) AS ever_passed
       FROM training_quiz_attempt
       WHERE quiz_id = $1
       GROUP BY email
     ),
     online AS (
       SELECT actor_email,
              MAX(ts) AS last_ts,
              AVG(EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Ho_Chi_Minh'))::numeric(4,1) AS avg_hour
       FROM audit_log
       WHERE ts > now() - INTERVAL '30 days'
       GROUP BY actor_email
     )
     SELECT r.role AS audience_role,
            count(*) AS active_users,
            count(a.email) AS attempted,
            count(a.email) FILTER (WHERE a.ever_passed) AS passed,
            MAX(o.last_ts)::text AS most_recent_online,
            AVG(o.avg_hour)::numeric(4,1)::text AS typical_online_hour
     FROM role_users r
     LEFT JOIN attempts a ON a.email = r.email
     LEFT JOIN online o ON o.actor_email = r.email
     GROUP BY r.role
     ORDER BY r.role`,
    [quizId, audience]
  );
  return rows.map((r) => ({
    audience_role: r.audience_role,
    active_users: Number(r.active_users),
    attempted: Number(r.attempted),
    passed: Number(r.passed),
    most_recent_online: r.most_recent_online,
    typical_online_hour:
      r.typical_online_hour === null ? null : Number(r.typical_online_hour),
  }));
}

/** Full questions (incl answer_idx) — dùng khi chấm bài. */
export async function getQuizFull(id: number): Promise<FullTrainingQuiz["questions_full"] | null> {
  if (!isEnabled()) return null;
  const rows = await query<{
    questions: NonNullable<FullTrainingQuiz["questions_full"]>;
  }>(
    `SELECT questions FROM training_quiz WHERE id = $1 AND status = 'published'`,
    [id]
  );
  if (rows.length === 0) return null;
  return rows[0].questions ?? [];
}

export async function recordQuizAttempt(params: {
  quizId: number;
  email: string;
  answers: Array<{ question_id: string; choice_idx: number }>;
  scorePct: number;
  passed: boolean;
}): Promise<{ id: number }> {
  if (!isEnabled()) throw new Error("DATABASE_URL chưa set");
  const rows = await query<{ id: number }>(
    `INSERT INTO training_quiz_attempt
       (quiz_id, email, answers, score_pct, passed)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id`,
    [
      params.quizId,
      params.email.toLowerCase(),
      JSON.stringify(params.answers),
      params.scorePct,
      params.passed,
    ]
  );
  return { id: rows[0].id };
}

export async function publishTrainingQuiz(id: number): Promise<boolean> {
  if (!isEnabled()) return false;
  const rows = await query<{ id: number }>(
    `UPDATE training_quiz SET status='published', updated_at=now()
     WHERE id=$1 AND status='draft' RETURNING id`,
    [id]
  );
  return rows.length > 0;
}
