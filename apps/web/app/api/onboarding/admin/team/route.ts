import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, isEnabled } from "@/lib/db";
import {
  computeFocusScore,
  isLow,
  aggregatePopupMetrics,
  upsertEvaluation,
} from "@/lib/onboarding/focus-score";
import { isoWeekLabel } from "@/lib/onboarding/weekly-assignment";

export const runtime = "nodejs";

interface TeamRow {
  email: string;
  role: string;
  focusScore: number;
  isLow: boolean;
  passedAssignmentCount: number;
  totalAssignmentCount: number;
  popupResponseRate: number;
  humorAccuracy: number;
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden" } },
      { status: 403 }
    );
  }
  if (!isEnabled()) {
    return NextResponse.json({ ok: true, data: { rows: [], period: null } });
  }

  const url = new URL(req.url);
  const periodLabel = url.searchParams.get("period") ?? isoWeekLabel(new Date());

  // List active employees (lead chỉ thấy team mình — v1 simplification:
  // lead thấy toàn bộ employee/lead, NOT admin. Cải thiện sau khi có team_membership table).
  const accountsResult = await query<{
    email: string;
    role: string;
  }>(
    `SELECT r.email, r.role
     FROM roles r
     INNER JOIN account_extras ae ON ae.email = r.email
     WHERE ae.onboarding_bot_enabled = true
       AND r.disabled = false
       AND r.role IN ('employee','lead')
     ORDER BY r.role, r.email`
  );

  // Period boundary: ISO week start
  const now = new Date();
  const weekStart = new Date(now);
  const day = (weekStart.getDay() + 6) % 7;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - day);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const rows: TeamRow[] = [];
  for (const acc of accountsResult) {
    const popupMetrics = await aggregatePopupMetrics(acc.email, weekStart, weekEnd);
    const assignmentResult = await query<{
      total: string;
      passed: string;
    }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status IN ('passed','closed_ok'))::text AS passed
       FROM weekly_assignment
       WHERE email = $1 AND week_iso = $2`,
      [acc.email, periodLabel]
    );
    const total = Number(assignmentResult[0]?.total ?? 0);
    const passed = Number(assignmentResult[0]?.passed ?? 0);
    const passPct = total > 0 ? passed / total : 0;
    const score = computeFocusScore({
      assignmentsPassPct: passPct,
      popupResponseRate: popupMetrics.responseRate,
      humorAccuracy: popupMetrics.humorAccuracy,
    });
    const lowFlag = isLow(score);

    // Persist evaluation (best-effort)
    await upsertEvaluation(acc.email, { kind: "week", label: periodLabel }, {
      assignmentsPassPct: passPct,
      popupResponseRate: popupMetrics.responseRate,
      humorAccuracy: popupMetrics.humorAccuracy,
    }).catch(() => {});

    rows.push({
      email: acc.email,
      role: acc.role,
      focusScore: Math.round(score),
      isLow: lowFlag,
      passedAssignmentCount: passed,
      totalAssignmentCount: total,
      popupResponseRate: popupMetrics.responseRate,
      humorAccuracy: popupMetrics.humorAccuracy,
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      period: { kind: "week", label: periodLabel },
      rows,
    },
  });
}
