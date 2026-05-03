import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { query, isEnabled } from "@/lib/db";
import { listForEmail } from "@/lib/onboarding/weekly-assignment";

export const runtime = "nodejs";

/**
 * Admin/lead drill-down 1 employee — assignment timeline + popup metadata
 * (KHÔNG decrypt response_text; admin xem decrypted phải hit endpoint riêng).
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden" } },
      { status: 403 }
    );
  }
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  if (!email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "email không hợp lệ" } },
      { status: 400 }
    );
  }
  if (!isEnabled()) {
    return NextResponse.json({ ok: true, data: { email, assignments: [], popupMetadata: [] } });
  }

  const assignments = await listForEmail(email, 24);

  const popupMeta = await query<{
    id: string;
    type: string;
    scheduled_at: Date;
    sent_at: Date | null;
    response_flag: string | null;
    humor_correct: boolean | null;
  }>(
    `SELECT id::text, type, scheduled_at, sent_at, response_flag, humor_correct
     FROM daily_popup
     WHERE email = $1
     ORDER BY scheduled_at DESC
     LIMIT 100`,
    [email]
  );

  return NextResponse.json({
    ok: true,
    data: {
      email,
      assignments,
      popupMetadata: popupMeta.map((p) => ({
        id: p.id,
        type: p.type,
        scheduledAt: p.scheduled_at,
        sentAt: p.sent_at,
        responseFlag: p.response_flag,
        humorCorrect: p.humor_correct,
      })),
    },
  });
}
