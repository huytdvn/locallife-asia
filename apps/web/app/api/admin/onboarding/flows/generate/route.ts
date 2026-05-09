import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { generateOnboardingFlow } from "@/lib/admin-builders/ai";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const bodySchema = z.object({
  brief: z.string().min(8).max(2000),
  audienceRole: z.enum(["employee", "lead", "admin", "host", "lok", "guest"]),
  level: z.enum(["entry", "mid", "senior"]).optional(),
  motto: z.string().max(200).optional(),
});

/**
 * POST /api/admin/onboarding/flows/generate
 * { brief, audienceRole, level?, motto? } → OnboardingFlowDraft
 *
 * Không lưu DB ở đây — chỉ trả về draft để admin review/edit ở UI rồi
 * gọi POST /api/admin/onboarding/flows để save. Tách 2 bước để cho phép
 * regenerate mà không cần xoá row cũ.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body cần { brief, audienceRole, level?, motto? }" },
      { status: 400 }
    );
  }
  try {
    const draft = await generateOnboardingFlow({
      brief: parsed.data.brief,
      audienceRole: parsed.data.audienceRole as Role,
      level: parsed.data.level,
      motto: parsed.data.motto,
    });
    if (draft.steps.length === 0) {
      return NextResponse.json(
        { error: "AI không sinh được step hợp lệ — thử brief cụ thể hơn?" },
        { status: 422 }
      );
    }
    return NextResponse.json({ draft });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ai_failed" },
      { status: 500 }
    );
  }
}
