import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { suggestOnboardingIdeas } from "@/lib/admin-builders/ai";
import type { Role } from "@/lib/rbac";

export const runtime = "nodejs";

const bodySchema = z.object({
  audienceRole: z.enum(["employee", "lead", "admin", "host", "lok", "guest"]),
  level: z.enum(["entry", "mid", "senior"]).optional(),
});

/**
 * POST /api/admin/onboarding/flows/suggest-ideas
 * { audienceRole, level? } → 3 OnboardingIdea
 *
 * Trigger: nút "✨ AI gợi ý ý tưởng" ở /admin/onboarding/new khi admin lười
 * nghĩ. Trả về 3 lựa chọn để pick → đẩy vào generate-flow tiếp.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Body cần { audienceRole, level? }" }, { status: 400 });
  }
  try {
    const ideas = await suggestOnboardingIdeas({
      audienceRole: parsed.data.audienceRole as Role,
      level: parsed.data.level,
    });
    return NextResponse.json({ ideas });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ai_failed" },
      { status: 500 }
    );
  }
}
