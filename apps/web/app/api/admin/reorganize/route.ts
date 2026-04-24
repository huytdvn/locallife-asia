import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  buildReorganizePlan,
  applyReorganizePlan,
  type ReorganizeMode,
  type ReorganizePlan,
} from "@/lib/reorganize";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (body.op === "plan") {
      const mode: ReorganizeMode = body.mode ?? "classify-only";
      const plan = await buildReorganizePlan(mode, undefined, body.limit);
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "draft_update",
        metadata: {
          reorganize_op: "plan",
          mode,
          scanned: plan.scanned,
          to_move: plan.items.filter((i) => i.pathChanged).length,
          to_rewrite: plan.items.filter((i) => i.bodyChanged).length,
        },
      });
      return NextResponse.json(plan);
    }

    if (body.op === "apply") {
      if (!body.plan || !Array.isArray(body.plan.items)) {
        return NextResponse.json({ error: "missing plan" }, { status: 400 });
      }
      const result = applyReorganizePlan(body.plan);
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
