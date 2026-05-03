import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { respondToPopup } from "@/lib/onboarding/popup-store";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  responseText: z.string().max(2000).optional(),
  humorAnswer: z.enum(["A", "B", "C", "D"]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(req);
  const { id } = await params;
  const popupId = Number(id);
  if (!Number.isInteger(popupId) || popupId <= 0) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: "id không hợp lệ" } },
      { status: 400 }
    );
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "validation", message: String(e) } },
      { status: 400 }
    );
  }

  try {
    const result = await respondToPopup({
      id: popupId,
      email: session.email,
      responseText: body.responseText,
      humorAnswer: body.humorAnswer,
    });
    await writeAudit({
      actorEmail: session.email,
      role: session.role,
      action: "onboarding.popup.responded",
      metadata: {
        popupId,
        humorCorrect: result.humorCorrect,
        hasText: !!body.responseText,
      },
    });
    return NextResponse.json({
      ok: true,
      data: { id: popupId, humorCorrect: result.humorCorrect },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg === "Forbidden" ? 403 : msg.includes("không tồn tại") ? 404 : 400;
    return NextResponse.json(
      { ok: false, error: { code: "respond_fail", message: msg } },
      { status: code }
    );
  }
}
