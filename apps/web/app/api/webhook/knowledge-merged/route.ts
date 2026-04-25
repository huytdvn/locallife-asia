import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

/**
 * GitHub webhook: PR merge / push lên knowledge repo.
 *
 * Flow:
 *   1. Verify HMAC SHA-256 (X-Hub-Signature-256).
 *   2. Chỉ xử lý event `push` tới default branch.
 *   3. Chạy scripts/sync-knowledge.sh (tier 1 → tier 2).
 *   4. Trigger scripts/sync-to-r2.py --apply (tier 2 → tier 3, background).
 *   5. (Optional) Trigger re-embed qua worker khác.
 *
 * Verify local: curl với X-Hub-Signature-256 được tính từ body + secret.
 */
export async function POST(req: Request) {
  const secret = process.env.KNOWLEDGE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const rawBody = await req.text();
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }
  if (event !== "push") {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const payload = safeJson(rawBody);
  const branch = (payload?.ref ?? "").toString().replace("refs/heads/", "");
  const expected = process.env.KNOWLEDGE_REPO_BRANCH ?? "main";
  if (branch !== expected) {
    return NextResponse.json({ ok: true, ignored: `branch=${branch}` });
  }

  const repoRoot = path.resolve(process.cwd(), "..", "..");
  const syncScript = path.join(repoRoot, "scripts", "sync-knowledge.sh");
  const r2Script = path.join(repoRoot, "scripts", "sync-to-r2.py");

  const results: Record<string, string> = {};
  try {
    const { stdout } = await execFileAsync("bash", [syncScript], {
      timeout: 60_000,
    });
    results.sync = stdout.trim().slice(-200);
  } catch (err) {
    results.sync_error = truncate(err);
  }

  // Fire and forget: R2 archive có thể chậm (batch upload).
  execFile(
    "python3",
    [r2Script, "--apply"],
    { timeout: 300_000 },
    (err, stdout) => {
      if (err) console.error("[r2-sync] failed:", err);
      else console.log("[r2-sync]", stdout.trim().slice(-200));
    }
  );
  results.r2_sync = "started";

  return NextResponse.json({ ok: true, results });
}

function verifySignature(body: string, header: string, secret: string): boolean {
  if (!header.startsWith("sha256=")) return false;
  const received = header.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function truncate(v: unknown, n = 200): string {
  const s = v instanceof Error ? v.message : String(v);
  return s.length > n ? s.slice(0, n) + "…" : s;
}
