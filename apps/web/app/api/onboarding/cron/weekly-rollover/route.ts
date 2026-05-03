import { NextResponse } from "next/server";
import { listActiveAccounts } from "@/lib/onboarding/account-extras";
import { getRoleFromDb } from "@/lib/roles";
import {
  isoWeekLabel,
  pickPathForAccount,
  createAssignment,
  getCurrentForEmail,
} from "@/lib/onboarding/weekly-assignment";

export const runtime = "nodejs";

function requireCronToken(req: Request): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!requireCronToken(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized" } },
      { status: 401 }
    );
  }
  const accounts = await listActiveAccounts();
  const week = isoWeekLabel(new Date());
  const summary = {
    week,
    accounts: accounts.length,
    created: 0,
    skipped_already_assigned: 0,
    skipped_no_path: 0,
    errors: [] as Array<{ email: string; error: string }>,
  };

  for (const acc of accounts) {
    try {
      const existing = await getCurrentForEmail(acc.email, week);
      if (existing) {
        summary.skipped_already_assigned++;
        continue;
      }
      const role = await getRoleFromDb(acc.email);
      if (!role) {
        summary.errors.push({ email: acc.email, error: "no role" });
        continue;
      }
      const slug = await pickPathForAccount(acc.email, role);
      if (!slug) {
        summary.skipped_no_path++;
        continue;
      }
      const id = await createAssignment({
        email: acc.email,
        weekIso: week,
        trainingSlug: slug,
      });
      if (id > 0) summary.created++;
    } catch (e) {
      summary.errors.push({
        email: acc.email,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ ok: true, data: summary });
}
