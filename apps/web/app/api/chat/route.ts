import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, CHAT_MODEL } from "@/lib/anthropic";
import { buildSystemPrompt } from "@/lib/prompt";
import { toolDefinitions, runTool } from "@/lib/tools";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ),
});

// Phase 0: non-streaming. Phase 1 sẽ chuyển sang SSE streaming.
export async function POST(req: Request) {
  const session = await requireSession(req);
  const { messages } = bodySchema.parse(await req.json());

  const systemBlocks = buildSystemPrompt({
    role: session.role,
    audience: session.audience,
  });

  let response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system: systemBlocks,
    tools: toolDefinitions,
    messages,
  });

  const citations: string[] = [];

  // Tool-use loop (đơn giản, Phase 1 sẽ refactor).
  while (response.stop_reason === "tool_use") {
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => {
        if (tu.type !== "tool_use") return null;
        const out = await runTool(tu.name, tu.input, session);
        if (out.citations) citations.push(...out.citations);
        return {
          type: "tool_result" as const,
          tool_use_id: tu.id,
          content: out.content,
        };
      })
    );
    response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      tools: toolDefinitions,
      messages: [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults.filter(Boolean) as never },
      ],
    });
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");

  return NextResponse.json({
    content: text,
    citations: Array.from(new Set(citations)),
  });
}
