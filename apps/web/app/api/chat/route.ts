import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
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

type ClientMessage = z.infer<typeof bodySchema>["messages"][number];

export async function POST(req: Request) {
  const session = await requireSession(req);
  const { messages } = bodySchema.parse(await req.json());

  const systemBlocks = buildSystemPrompt({
    role: session.role,
    audience: session.audience,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        await runAgentLoop({
          session,
          systemBlocks,
          initialMessages: messages,
          emit,
        });
        emit("done", {});
      } catch (err) {
        emit("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runAgentLoop(params: {
  session: Awaited<ReturnType<typeof requireSession>>;
  systemBlocks: ReturnType<typeof buildSystemPrompt>;
  initialMessages: ClientMessage[];
  emit: (event: string, data: unknown) => void;
}) {
  const { session, systemBlocks, initialMessages, emit } = params;
  const citations: string[] = [];
  const convo: Anthropic.Messages.MessageParam[] = initialMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let turn = 0; turn < 6; turn++) {
    const streamHandle = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: 1024,
      system: systemBlocks,
      tools: toolDefinitions,
      messages: convo,
    });

    streamHandle.on("text", (delta) => {
      emit("delta", { text: delta });
    });

    const final = await streamHandle.finalMessage();

    convo.push({ role: "assistant", content: final.content });

    if (final.stop_reason !== "tool_use") {
      emit("citations", { citations: Array.from(new Set(citations)) });
      return;
    }

    const toolUses = final.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      emit("tool_start", { name: tu.name, input: tu.input });
      const out = await runTool(tu.name, tu.input, session);
      if (out.citations) citations.push(...out.citations);
      emit("tool_result", { name: tu.name, citations: out.citations ?? [] });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: out.content,
      });
    }

    convo.push({ role: "user", content: toolResults });
  }

  emit("error", { message: "Agent tool-use loop exceeded 6 turns" });
}
