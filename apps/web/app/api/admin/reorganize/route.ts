import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  buildReorganizePlan,
  applyReorganizePlan,
  type ReorganizeMode,
  type ReorganizePlan,
} from "@/lib/reorganize";

// Validate the plan shape client sends back on apply. Admin-only so blast
// radius is already limited, but parsing protects against typos/partial
// states that would otherwise cause confusing FS errors mid-apply.
const ReorganizeItemSchema = z.object({
  id: z.string(),
  currentPath: z.string().min(1),
  currentTitle: z.string(),
  newPath: z.string().min(1),
  newTitle: z.string(),
  pathChanged: z.boolean(),
  titleChanged: z.boolean(),
  bodyChanged: z.boolean(),
  currentBody: z.string().optional(),
  newBody: z.string().optional(),
  reasoning: z.string().optional().default(""),
  confidence: z.number(),
  skipped: z.string().optional(),
});
const ReorganizePlanSchema = z.object({
  items: z.array(ReorganizeItemSchema),
  scanned: z.number(),
  generatedAt: z.string(),
  hasMore: z.boolean().optional(),
  nextOffset: z.number().optional(),
});

export const runtime = "nodejs";
// Vercel Pro max: 900s. For classify-only (~2s/doc × ~100 docs = ~200s) this
// is plenty. For rewrite mode (~10s/doc × ~100 docs = ~17min) the client
// must page via `limit` + `offset`; a single request will still fit inside
// maxDuration if the KB stays under ~80 docs per page.
export const maxDuration = 800;

/**
 * POST /api/admin/reorganize
 *   Body: { op: "plan" | "apply", mode?: ReorganizeMode, plan?: ReorganizePlan, limit?: number }
 *
 * Dùng JSON cho đơn giản — progress feedback qua client-side poll (plan
 * trả về toàn bộ 1 lần). Vì KB hiện tại ~100 docs, mỗi classify ~1-3s
 * trên Flash Lite, tổng ~5 phút acceptable. Khi KB lớn hơn, migrate sang
 * RQ job + poll giống upload.
 */
export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden — chỉ admin được sắp xếp lại KB" },
      { status: 403 },
    );
  }

  let body: {
    op: "plan" | "apply";
    mode?: ReorganizeMode;
    plan?: ReorganizePlan;
    limit?: number;
    offset?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (body.op === "plan") {
      const mode: ReorganizeMode = body.mode ?? "classify-only";
      const plan = await buildReorganizePlan(
        mode,
        undefined,
        body.limit,
        body.offset ?? 0,
      );
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "draft_update",
        metadata: {
          reorganize_op: "plan",
          mode,
          scanned: plan.scanned,
          offset: body.offset ?? 0,
          has_more: plan.hasMore,
          to_move: plan.items.filter((i) => i.pathChanged).length,
          to_rewrite: plan.items.filter((i) => i.bodyChanged).length,
        },
      });
      return NextResponse.json(plan);
    }

    if (body.op === "apply") {
      const parsed = ReorganizePlanSchema.safeParse(body.plan);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "invalid plan",
            detail: parsed.error.issues.slice(0, 5).map((i) => ({
              path: i.path.join("."),
              msg: i.message,
            })),
          },
          { status: 400 },
        );
      }
      const result = applyReorganizePlan(parsed.data as ReorganizePlan);
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "commit_update",
        metadata: {
          reorganize_op: "apply",
          ...result,
        },
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "reorganize_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
