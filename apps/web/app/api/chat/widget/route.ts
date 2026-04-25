/**
 * Public widget chat endpoint — for back-office host & LOK dashboards.
 *
 * Auth chain:
 *   1. Origin must be in WIDGET_ALLOWED_ORIGINS (CORS preflight + real check)
 *   2. Authorization: Bearer <token> — HMAC-signed by /api/widget/token
 *   3. Rate-limited per tenantId
 *
 * Knowledge access is enforced by the SAME RBAC layer used by /api/chat —
 * the synthesized session has role='host' or 'lok', so canRead() filters
 * to host/* + public/* (or lok/* + public/*) automatically. Internal
 * docs are unreachable from this endpoint by construction.
 */

import { z } from "zod";
import type { Content, FunctionCall, Part } from "@google/genai";
import { genai, CHAT_MODEL } from "@/lib/llm";
import { toolDefinitions, runTool } from "@/lib/tools";
import { writeAudit, recordUnmatchedQuery } from "@/lib/audit";
import { audienceFor, type Role, type Session } from "@/lib/rbac";
import { checkAllowedOrigin, verifyWidgetToken } from "@/lib/widget-auth";
import { checkWidgetRate } from "@/lib/widget-rate-limit";
import { buildWidgetSystemInstruction } from "@/lib/widget-prompt";

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

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  const origin = checkAllowedOrigin(req.headers.get("origin"));
  if (!origin) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = checkAllowedOrigin(req.headers.get("origin"));
  if (!origin) {
    // Dev override: allow same-origin curl when X-Widget-Dev header set.
    const devBypass =
      process.env.NODE_ENV !== "production" &&
      req.headers.get("x-widget-dev") === "1";
    if (!devBypass) {
      return new Response(JSON.stringify({ error: "origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  const cors = corsHeaders(origin);

  let claims;
  try {
    const auth = req.headers.get("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/.exec(auth);
    if (!m) throw new Error("missing token");
    claims = verifyWidgetToken(m[1]);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "token invalid",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  const rate = checkWidgetRate(claims.tenantId);
  if (!rate.ok) {
    return new Response(
      JSON.stringify({
        error: "rate limit exceeded",
        retryAfter: rate.retryAfter,
      }),
      {
        status: 429,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          "Retry-After": String(rate.retryAfter ?? 60),
        },
      }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const { messages } = parsed.data;

  const role: Role = claims.mode;
  const session: Session = {
    email: `widget:${claims.mode}:${claims.tenantId}`,
    role,
    audience: audienceFor(role),
  };
  const systemInstruction = buildWidgetSystemInstruction(claims.mode);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      try {
        await runWidgetAgent({ session, systemInstruction, messages, emit });
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
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-RateLimit-Limit": String(rate.limit),
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}

async function runWidgetAgent(params: {
  session: Session;
  systemInstruction: string;
  messages: ClientMessage[];
  emit: (event: string, data: unknown) => void;
}) {
  const { session, systemInstruction, messages, emit } = params;
  const citations: string[] = [];
  const citationRefs: Array<{
    docId: string;
    path: string;
    heading: string;
    title: string;
  }> = [];
  const toolTrace: Array<{ name: string; input: unknown; resultLength: number }> = [];
  const finalText: string[] = [];

  const userLastQuery =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const contents: Content[] = messages.map((m) => ({
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

    const acc: Part[] = [];
    const calls: FunctionCall[] = [];
    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          emit("delta", { text: part.text });
          acc.push({ text: part.text });
          finalText.push(part.text);
        }
        if (part.functionCall) {
          calls.push(part.functionCall);
          acc.push({ functionCall: part.functionCall });
        }
      }
    }
    contents.push({ role: "model", parts: acc });

    if (calls.length === 0) {
      const seen = new Set<string>();
      const refs = citationRefs.filter((r) => {
        const k = `${r.docId}#${r.heading}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      emit("citations", { citations: Array.from(new Set(citations)), refs });
      await writeAudit({
        actorEmail: session.email,
        role: session.role,
        action: "widget_chat",
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

    const fnParts: Part[] = [];
    for (const fc of calls) {
      const name = fc.name ?? "";
      emit("tool_start", { name });
      const out = await runTool(name, fc.args ?? {}, session);
      if (out.citations) citations.push(...out.citations);
      if (out.citationRefs) citationRefs.push(...out.citationRefs);
      toolTrace.push({ name, input: fc.args, resultLength: out.content.length });
      emit("tool_result", { name, citations: out.citations ?? [] });
      fnParts.push({
        functionResponse: { name, response: { result: out.content } },
      });
    }
    contents.push({ role: "user", parts: fnParts });
  }

  emit("error", { message: "Widget agent exceeded 6 turns" });
}
