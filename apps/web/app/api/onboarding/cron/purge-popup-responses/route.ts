import { NextResponse } from "next/server";
import { purgeExpiredResponses } from "@/lib/onboarding/popup-store";

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
  const purged = await purgeExpiredResponses(new Date());
  return NextResponse.json({ ok: true, data: { purged } });
}
