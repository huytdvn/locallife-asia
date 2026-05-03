import { NextResponse } from "next/server";
import { getDueForDelivery, markSent } from "@/lib/onboarding/popup-store";

export const runtime = "nodejs";

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
  const due = await getDueForDelivery(new Date());
  let delivered = 0;
  for (const popup of due) {
    await markSent(popup.id);
    delivered++;
  }
  return NextResponse.json({ ok: true, data: { delivered } });
}
