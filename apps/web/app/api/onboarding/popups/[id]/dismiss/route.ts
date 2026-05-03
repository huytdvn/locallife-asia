import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { dismissPopup } from "@/lib/onboarding/popup-store";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";

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

  await dismissPopup(popupId, session.email);
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "onboarding.popup.dismissed",
    metadata: { popupId },
  });

  return NextResponse.json({ ok: true, data: { id: popupId } });
}
