/**
 * Token-mint endpoint — back-office calls this server-to-server.
 *
 * Auth: shared secret in `Authorization: Bearer <BACKOFFICE_SHARED_SECRET>`.
 * Body: { mode: "host"|"lok", tenantId: string, ttlSeconds?: number }
 * Returns: { token, exp }
 *
 * The browser never sees BACKOFFICE_SHARED_SECRET — back-office mints
 * the token from its own backend, then sends only the token down to
 * the dashboard widget.
 */

import { z } from "zod";
import { checkBackofficeSecret, signWidgetToken } from "@/lib/widget-auth";

export const runtime = "nodejs";

const bodySchema = z.object({
  mode: z.enum(["host", "lok"]),
  tenantId: z.string().min(1).max(128),
  ttlSeconds: z.number().int().min(60).max(86400).optional(),
});

export async function POST(req: Request) {
  if (!checkBackofficeSecret(req.headers.get("authorization"))) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const token = signWidgetToken(parsed.data);
  const exp = Math.floor(Date.now() / 1000) + (parsed.data.ttlSeconds ?? 3600);
  return new Response(JSON.stringify({ token, exp }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
