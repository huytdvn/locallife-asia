import { z } from "zod";
import type { Content, FunctionCall, Part } from "@google/genai";
import { genai, CHAT_MODEL } from "@/lib/llm";
import { buildSystemInstruction } from "@/lib/prompt";
import { toolDefinitions, runTool } from "@/lib/tools";
import { requireSession } from "@/lib/auth";
import { writeAudit, recordUnmatchedQuery } from "@/lib/audit";

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

  const systemInstruction = buildSystemInstruction({
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
          systemInstruction,
          initialMessages: messages,
          emit,
        });
        emit("done", {});
      } catch (err) {
        emit("error", {
          message: err instanceof Error ? err.message : String(err),
        });
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
  systemInstruction: string;
  initialMessages: ClientMessage[];
  emit: (event: string, data: unknown) => void;
}) {
  const { session, systemInstruction, initialMessages, emit } = params;
  const citations: string[] = [];
  const toolTrace: Array<{ name: string; input: unknown; resultLength: number }> = [];
  const finalText: string[] = [];

  const userLastQuery =
    [...initialMessages].reverse().find((m) => m.role === "user")?.content ?? "";

  const contents: Content[] = initialMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  for (let turn = 0; turn < 6; turn++) {
    const response = await genai.models.generateContentStream({
      model: CHAT_MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: toolDefinitions }],
      },
    });

    const accumulatedParts: Part[] = [];
    const functionCalls: FunctionCall[] = [];

    for await (const chunk of response) {
      const candidate = chunk.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          emit("delta", { text: part.text });
          accumulatedParts.push({ text: part.text });
          finalText.push(part.text);
        }
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
          accumulatedParts.push({ functionCall: part.functionCall });
        }
      }
    }

    contents.push({ role: "model", parts: accumulatedParts });

    if (functionCalls.length === 0) {
      emit("citations", { citations: Array.from(new Set(citations)) });
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "chat",
        query: userLastQuery,
        answerExcerpt: finalText.join(""),
        citations: Array.from(new Set(citations)),
        toolCalls: toolTrace,
      });
      if (citations.length === 0 && userLastQuery) {
        await recordUnmatchedQuery(session.email, session.role, userLastQuery);
      }
      return;
    }

    const responseParts: Part[] = [];
    for (const fc of functionCalls) {
      const name = fc.name ?? "";
      emit("tool_start", { name, input: fc.args });
      const out = await runTool(name, fc.args ?? {}, session);
      if (out.citations) citations.push(...out.citations);
      toolTrace.push({ name, input: fc.args, resultLength: out.content.length });
      emit("tool_result", { name, citations: out.citations ?? [] });
      responseParts.push({
        functionResponse: {
          name,
          response: { result: out.content },
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  emit("error", { message: "Agent tool-use loop exceeded 6 turns" });
}
