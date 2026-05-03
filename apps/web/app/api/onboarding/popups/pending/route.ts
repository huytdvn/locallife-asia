import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getPendingForEmail } from "@/lib/onboarding/popup-store";
import { parseHumor } from "@/lib/onboarding/popup-gen";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireSession(req);
  const popups = await getPendingForEmail(session.email);

  return NextResponse.json({
    ok: true,
    data: popups.map((p) => ({
      id: p.id,
      type: p.type,
      content: p.type === "humor" ? parseHumor(p.contentText) : p.contentText,
      sentAt: p.sentAt?.toISOString() ?? null,
    })),
  });
}
