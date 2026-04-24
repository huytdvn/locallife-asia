import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getProgress, markStep } from "@/lib/training-progress";
import { getPathBySlug } from "@/lib/training";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession(req);
  const { slug } = await params;
  const progress = getProgress(session.email, slug);
  return NextResponse.json({ progress });
}

/**
 * POST body { doc_path: string, done: boolean } — tick/untick 1 step.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await requireSession(req);
  const { slug } = await params;
  const pathDef = getPathBySlug(slug, session.role);
  if (!pathDef) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    doc_path?: string;
    done?: boolean;
  };
  if (!body.doc_path) {
    return NextResponse.json({ error: "missing doc_path" }, { status: 400 });
  }
  // Validate step thuộc path
  const allSteps = pathDef.sections.flatMap((s) => s.steps.map((st) => st.doc_path));
  if (!allSteps.includes(body.doc_path)) {
    return NextResponse.json(
      { error: "step not in path" },
      { status: 400 }
    );
  }
  const progress = markStep(
    session.email,
    slug,
    body.doc_path,
    body.done !== false
  );
  return NextResponse.json({ progress });
}
