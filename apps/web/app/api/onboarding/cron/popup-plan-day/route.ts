import { NextResponse } from "next/server";
import { z } from "zod";
import { listActiveAccounts } from "@/lib/onboarding/account-extras";
import {
  planPopupsForDay,
  DEFAULT_RATIO,
  type PopupRatio,
} from "@/lib/onboarding/popup-randomizer";
import { generatePopupContent } from "@/lib/onboarding/popup-gen";
import { insertPopup } from "@/lib/onboarding/popup-store";

export const runtime = "nodejs";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function requireCronToken(req: Request): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const got = req.headers.get("authorization") ?? "";
  return got === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!requireCronToken(req)) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized" } },
      { status: 401 }
    );
  }
  let body: { date?: string } = {};
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: String(e) } },
      { status: 400 }
    );
  }
  const date = body.date ? new Date(body.date) : new Date();

  const accounts = await listActiveAccounts();
  const summary = { accounts: accounts.length, popupsCreated: 0, errors: [] as Array<{ email: string; error: string }> };

  for (const acc of accounts) {
    try {
      const ratio: PopupRatio = acc.popupRatioOverride ?? DEFAULT_RATIO;
      const planned = planPopupsForDay({
        date,
        workHoursStart: acc.workHoursStart,
        workHoursEnd: acc.workHoursEnd,
        ratio,
      });
      for (const slot of planned) {
        const content = generatePopupContent(slot.type);
        await insertPopup({
          email: acc.email,
          type: content.type,
          contentText: content.contentText,
          humorCorrectOption: content.humorCorrectOption,
          scheduledAt: slot.scheduledAt,
        });
        summary.popupsCreated++;
      }
    } catch (e) {
      summary.errors.push({
        email: acc.email,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ ok: true, data: summary });
}
