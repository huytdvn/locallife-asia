import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import {
  getCurrentForEmail,
  isoWeekLabel,
  listForEmail,
} from "@/lib/onboarding/weekly-assignment";
import { getPathBySlug } from "@/lib/training";
import { getProgress } from "@/lib/training-progress";
import { isAdhocSlug, resolveAdhocPath } from "@/lib/onboarding/adhoc-training";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  const week = isoWeekLabel(new Date());
  const current = await getCurrentForEmail(session.email, week);

  let enriched = null;
  if (current) {
    const path = isAdhocSlug(current.trainingSlug)
      ? await resolveAdhocPath(current.trainingSlug, session.role)
      : getPathBySlug(current.trainingSlug, session.role);
    const progress = getProgress(session.email, current.trainingSlug);
    enriched = {
      ...current,
      path: path
        ? {
            slug: path.slug,
            title: path.title,
            subtitle: path.subtitle,
            duration: path.duration,
            totalSteps: path.total_steps,
            accessibleSteps: path.accessible_steps,
            sections: path.sections,
          }
        : null,
      progress: {
        completedSteps: progress?.completed_steps ?? [],
        bestQuizScore: progress?.quiz?.best_score ?? null,
        passedAt: progress?.quiz?.passed_at ?? null,
      },
    };
  }

  const history = await listForEmail(session.email, 6);
  return NextResponse.json({
    ok: true,
    data: {
      week,
      current: enriched,
      history,
    },
  });
}
