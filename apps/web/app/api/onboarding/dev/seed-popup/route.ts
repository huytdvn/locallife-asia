import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { ensureExtras } from "@/lib/onboarding/account-extras";
import { generatePopupContent } from "@/lib/onboarding/popup-gen";
import { insertPopup, markSent, getPendingForEmail } from "@/lib/onboarding/popup-store";
import type { PopupType } from "@/lib/onboarding/popup-randomizer";
import { query, isEnabled } from "@/lib/db";

/**
 * DEV ONLY — seed 1 popup cho user hiện tại để demo PopupCard.
 *
 * - Block in production.
 * - Bật onboarding flag cho user nếu chưa.
 * - Insert popup với scheduled_at = now() AND sent_at = now() (delivered ngay).
 * - PopupHost sẽ pickup ở lần poll kế tiếp (≤ 30s).
 *
 * Query param `type=motivation|check_in|humor` để chọn dạng (default: humor — vui).
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: { code: "forbidden", message: "Dev-only endpoint" } },
      { status: 403 }
    );
  }
  if (!isEnabled()) {
    return NextResponse.json(
      { ok: false, error: { code: "no_db", message: "DATABASE_URL chưa set" } },
      { status: 500 }
    );
  }

  const session = await requireSession(req);
  const url = new URL(req.url);
  const requested = url.searchParams.get("type") as PopupType | null;
  const validTypes: PopupType[] = ["motivation", "check_in", "humor"];
  const type: PopupType = requested && validTypes.includes(requested) ? requested : "humor";

  // Đảm bảo role row tồn tại (dev: x-dev-role header tạo session với
  // email "dev@locallife.asia" có thể chưa có trong DB) — FK guard.
  await query(
    `INSERT INTO roles (email, role) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [session.email, session.role]
  );
  // Bật flag cho user nếu chưa
  await ensureExtras(session.email);
  await query(
    `UPDATE account_extras SET onboarding_bot_enabled = true WHERE email = $1`,
    [session.email]
  );

  const content = generatePopupContent(type);
  const id = await insertPopup({
    email: session.email,
    type: content.type,
    contentText: content.contentText,
    humorCorrectOption: content.humorCorrectOption,
    scheduledAt: new Date(),
  });
  await markSent(id);

  const pending = await getPendingForEmail(session.email);

  return NextResponse.json({
    ok: true,
    data: {
      seeded: { id, type, content: content.contentText },
      email: session.email,
      pendingCount: pending.length,
      hint:
        "Mở /dashboard và đợi tối đa 30s — PopupHost poll mỗi 30s. " +
        "Hoặc refresh /dashboard để pickup ngay.",
    },
  });
}
