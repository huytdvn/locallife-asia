import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  suggestClassify,
  improveBody,
  suggestTags,
  summarize,
  findSimilar,
} from "@/lib/ai-assist";

export const runtime = "nodejs";

type Action =
  | "classify"
  | "improve"
  | "tags"
  | "summarize"
  | "similar";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const session = await requireSession(req);
  if (session.role !== "admin" && session.role !== "lead") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { action } = await params;
  const a = action as Action;

  let body: {
    id?: string;
    title?: string;
    body?: string;
    existing?: string[];
    instruction?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    switch (a) {
      case "classify": {
        const out = await suggestClassify(body.title ?? "", body.body ?? "");
        await logAi(session.email, session.role, a, body.id);
        return NextResponse.json(out);
      }
      case "improve": {
        const newBody = await improveBody(
          body.title ?? "",
          body.body ?? "",
          body.instruction ?? ""
        );
        await logAi(session.email, session.role, a, body.id);
        return NextResponse.json({ body: newBody });
      }
      case "tags": {
        const tags = await suggestTags(
          body.title ?? "",
          body.body ?? "",
          body.existing ?? []
        );
        await logAi(session.email, session.role, a, body.id);
        return NextResponse.json({ tags });
      }
      case "summarize": {
        const summary = await summarize(body.title ?? "", body.body ?? "");
        await logAi(session.email, session.role, a, body.id);
        return NextResponse.json({ summary });
      }
      case "similar": {
        if (!body.id) {
          return NextResponse.json(
            { error: "missing id for similar" },
            { status: 400 }
          );
        }
        const similar = findSimilar(
          body.id,
          body.title ?? "",
          body.body ?? ""
        );
        return NextResponse.json({ similar });
      }
      default:
        return NextResponse.json(
          { error: `unknown action: ${a}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "ai_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

async function logAi(
  email: string,
  role: string,
  action: string,
  docId?: string
) {
  await writeAudit({
    actorEmail: email,
    role,
    action: "chat",
    docId,
    query: `ai_assist:${action}`,
    metadata: { ai_action: action },
  });
}
