import { z } from "zod";
import { requireSession, UnauthorizedError } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  INTERNAL_ROLES,
  disableRole,
  isAssignableRole,
  listRoles,
  upsertRole,
} from "@/lib/roles";

export const runtime = "nodejs";

function adminOnly<T>(fn: () => Promise<T>) {
  return async (req: Request) => {
    try {
      const session = await requireSession(req);
      if (session.role !== "admin") {
        return new Response(
          JSON.stringify({ error: "Chỉ admin mới quản lý được role" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      const body = await fn();
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const status = err instanceof UnauthorizedError ? 401 : 400;
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

export async function GET(req: Request) {
  return adminOnly(async () => {
    const result = await listRoles();
    return {
      rows: result.rows,
      status: result.status,
      errorMessage: result.errorMessage,
      validRoles: INTERNAL_ROLES,
    };
  })(req);
}

const upsertSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.string().refine(
    isAssignableRole,
    "Chỉ assign được admin / lead / employee. host & lok dùng widget token, không qua admin UI."
  ),
});

export async function POST(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const parsed = upsertSchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues.map((i) => i.message).join(", ") }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const { email, role } = parsed.data;
  await upsertRole({ email, role, createdBy: session.email });
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_upsert",
    metadata: { target: email, role },
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(req: Request) {
  const session = await requireSession(req);
  if (session.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const rawEmail = url.searchParams.get("email");
  if (!rawEmail) {
    return new Response(JSON.stringify({ error: "email required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Lowercase both sides — DB stores lowercase, but URL/session.email may
  // arrive mixed-case. Strict compare here previously let an admin bypass
  // self-disable by varying case.
  const email = rawEmail.toLowerCase();
  if (email === session.email.toLowerCase()) {
    return new Response(
      JSON.stringify({ error: "Không thể tự disable chính mình" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  await disableRole(email);
  await writeAudit({
    actorEmail: session.email,
    role: session.role,
    action: "role_disable",
    metadata: { target: email },
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
