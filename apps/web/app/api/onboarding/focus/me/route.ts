import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { aggregatePopupMetrics, computeFocusScore, isLow } from "@/lib/onboarding/focus-score";
import { POSITIVE_DASHBOARD_COPY } from "@/lib/onboarding/copy.vi";

export const runtime = "nodejs";

function isoWeekLabel(d: Date): string {
  // simple ISO week label "YYYY-Www"
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // Mon=0
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - day);
  return r;
}

function pickCopy(score: number, low: boolean): string {
  if (low) return POSITIVE_DASHBOARD_COPY.lowFocus;
  if (score >= 80) return POSITIVE_DASHBOARD_COPY.highFocus;
  return POSITIVE_DASHBOARD_COPY.midFocus;
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const popupMetrics = await aggregatePopupMetrics(session.email, weekStart, weekEnd);

  // Assignment pass pct: tận dụng training-progress JSON nếu có; v1
  // không track pass rate weekly chính xác — return 1 nếu user đã pass
  // ít nhất 1 quiz trong tuần qua, else 0. Defer sophistication to v1.1.
  const assignmentsPassPct = 0; // placeholder until weekly_assignment lib lands

  const score = computeFocusScore({
    assignmentsPassPct,
    popupResponseRate: popupMetrics.responseRate,
    humorAccuracy: popupMetrics.humorAccuracy,
  });
  const low = isLow(score);

  return NextResponse.json({
    ok: true,
    data: {
      period: { kind: "week", label: isoWeekLabel(now) },
      focusScore: Math.round(score),
      isLow: low,
      popupResponseRate: popupMetrics.responseRate,
      humorAccuracy: popupMetrics.humorAccuracy,
      message: pickCopy(score, low),
    },
  });
}
