import { query, isEnabled } from "@/lib/db";

/**
 * FR-020 formula: focus_score = 100 * (0.5 * pass + 0.3 * resp + 0.2 * humor).
 * Thresh "low" = 60. Cấu hình được qua env override (defer v2).
 */

export interface FocusInputs {
  assignmentsPassPct: number;   // 0..1 — fraction of completed assignments passed in period
  popupResponseRate: number;    // 0..1 — responded / sent
  humorAccuracy: number;        // 0..1 — correct / answered humor
}

export const WEIGHTS = { pass: 0.5, response: 0.3, humor: 0.2 };
export const LOW_THRESHOLD = 60;

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function computeFocusScore(inputs: FocusInputs): number {
  const pass = clamp01(inputs.assignmentsPassPct);
  const resp = clamp01(inputs.popupResponseRate);
  const humor = clamp01(inputs.humorAccuracy);
  return 100 * (WEIGHTS.pass * pass + WEIGHTS.response * resp + WEIGHTS.humor * humor);
}

export function isLow(score: number): boolean {
  return score < LOW_THRESHOLD;
}

export interface PeriodKey {
  kind: "week" | "month";
  label: string;
}

/**
 * Aggregate popup metrics cho 1 email trong khoảng [from, to). KHÔNG decrypt.
 */
export async function aggregatePopupMetrics(
  email: string,
  from: Date,
  to: Date
): Promise<{ responseRate: number; humorAccuracy: number }> {
  if (!isEnabled()) return { responseRate: 0, humorAccuracy: 0 };
  const rows = await query<{
    sent_count: string;
    responded_count: string;
    humor_count: string;
    humor_correct_count: string;
  }>(
    `SELECT
        COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::text AS sent_count,
        COUNT(*) FILTER (WHERE response_flag = 'responded')::text AS responded_count,
        COUNT(*) FILTER (WHERE type = 'humor' AND humor_user_answer IS NOT NULL)::text AS humor_count,
        COUNT(*) FILTER (WHERE type = 'humor' AND humor_correct = true)::text AS humor_correct_count
     FROM daily_popup
     WHERE email = $1 AND scheduled_at >= $2 AND scheduled_at < $3`,
    [email, from, to]
  );
  if (rows.length === 0) return { responseRate: 0, humorAccuracy: 0 };
  const r = rows[0];
  const sent = Number(r.sent_count);
  const responded = Number(r.responded_count);
  const humor = Number(r.humor_count);
  const humorCorrect = Number(r.humor_correct_count);
  return {
    responseRate: sent > 0 ? responded / sent : 0,
    humorAccuracy: humor > 0 ? humorCorrect / humor : 0,
  };
}

export async function upsertEvaluation(
  email: string,
  period: PeriodKey,
  inputs: FocusInputs
): Promise<void> {
  if (!isEnabled()) return;
  const score = computeFocusScore(inputs);
  await query(
    `INSERT INTO focus_evaluation
       (email, period_kind, period_label, assignments_pass_pct,
        popup_response_rate, humor_accuracy, focus_score, is_low)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (email, period_kind, period_label) DO UPDATE SET
       assignments_pass_pct = EXCLUDED.assignments_pass_pct,
       popup_response_rate = EXCLUDED.popup_response_rate,
       humor_accuracy = EXCLUDED.humor_accuracy,
       focus_score = EXCLUDED.focus_score,
       is_low = EXCLUDED.is_low,
       computed_at = now()`,
    [
      email,
      period.kind,
      period.label,
      inputs.assignmentsPassPct,
      inputs.popupResponseRate,
      inputs.humorAccuracy,
      score,
      isLow(score),
    ]
  );
}

export async function getEvaluation(
  email: string,
  period: PeriodKey
): Promise<FocusInputs & { focusScore: number; isLow: boolean } | null> {
  if (!isEnabled()) return null;
  const rows = await query<{
    assignments_pass_pct: number;
    popup_response_rate: number;
    humor_accuracy: number;
    focus_score: number;
    is_low: boolean;
  }>(
    `SELECT assignments_pass_pct, popup_response_rate, humor_accuracy,
            focus_score, is_low
     FROM focus_evaluation
     WHERE email = $1 AND period_kind = $2 AND period_label = $3`,
    [email, period.kind, period.label]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    assignmentsPassPct: r.assignments_pass_pct,
    popupResponseRate: r.popup_response_rate,
    humorAccuracy: r.humor_accuracy,
    focusScore: r.focus_score,
    isLow: r.is_low,
  };
}
