import fs from "node:fs";
import path from "node:path";
import { knowledgeRoot } from "@/lib/knowledge-loader";

/**
 * Sync trigger — sau khi commit lên GitHub, gọi ingest service để
 * fast-forward mount đọc (tier 2) + archive R2 (tier 3) ngay lập tức.
 *
 * Web container mount knowledge `:ro`, không tự pull được. Ingest
 * container có RW mount + git + boto3 nên là chỗ thực thi sync.
 *
 * Best-effort: lỗi mạng/timeout không nên chặn save (commit GitHub
 * đã thành công ⇒ tier 1 bền vững; tier 2/3 sẽ catch up qua cron).
 *
 * DEV fallback: nếu ingest unreachable VÀ NODE_ENV !== "production"
 * VÀ knowledgeRoot writable → ghi thẳng vào local fs để dev có thể
 * tra cứu ngay sau khi save mà không cần dựng ingest container.
 */

export interface SyncResult {
  ok: boolean;
  /** Field từ ingest, vd "fast-forward abc -> def" hoặc lỗi */
  detail?: string;
  /** True nếu R2 archive cũng được trigger thành công */
  r2?: boolean;
  /** Error message nếu best-effort fail (caller nên ghi audit) */
  error?: string;
  /** True nếu fallback dev đã ghi local fs */
  devFallback?: boolean;
}

export interface TriggerInput {
  /** Path tương đối repo (vd "knowledge/host/faq/abc.md"). Optional —
   *  nếu có thì ingest có thể chỉ archive file này lên R2 thay vì full sweep. */
  changedPath?: string;
  /** Reason để ingest log audit */
  reason?: string;
  /** Content vừa commit. Dùng cho dev fallback ghi local fs khi ingest down. */
  content?: string;
}

export async function triggerKnowledgeSync(
  input: TriggerInput = {}
): Promise<SyncResult> {
  const ingestResult = await callIngest(input);
  if (ingestResult.ok) return ingestResult;

  // Dev fallback — chỉ chạy khi không phải prod và caller cung cấp content.
  if (
    process.env.NODE_ENV !== "production" &&
    input.content &&
    input.changedPath
  ) {
    const fb = writeLocalFallback(input.changedPath, input.content);
    if (fb.ok) {
      return {
        ok: true,
        detail: `dev fallback: wrote ${fb.relPath}`,
        devFallback: true,
        error: ingestResult.error,
      };
    }
    return {
      ok: false,
      error: `ingest: ${ingestResult.error}; dev fallback: ${fb.error}`,
    };
  }
  return ingestResult;
}

async function callIngest(input: TriggerInput): Promise<SyncResult> {
  const base = process.env.INGEST_API_URL;
  if (!base) {
    return { ok: false, error: "INGEST_API_URL chưa set" };
  }
  const url = `${base.replace(/\/+$/, "")}/sync/knowledge`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.INGEST_API_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        changed_path: input.changedPath,
        reason: input.reason,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      detail?: string;
      r2?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? `ingest HTTP ${res.status}`,
        detail: data.detail,
      };
    }
    return { ok: data.ok ?? true, detail: data.detail, r2: data.r2 };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Ghi thẳng vào local mount để dev có thể đọc lại ngay.
 * `repoPath` là path tương đối repo (vd "knowledge/host/faq/abc.md");
 * trim subdir prefix để khớp với knowledgeRoot().
 */
function writeLocalFallback(
  repoPath: string,
  content: string
): { ok: boolean; relPath?: string; error?: string } {
  try {
    const subdir = process.env.KNOWLEDGE_REPO_SUBDIR ?? "knowledge";
    let rel = repoPath;
    if (subdir && rel.startsWith(`${subdir}/`)) {
      rel = rel.slice(subdir.length + 1);
    }
    const root = knowledgeRoot();
    const abs = path.join(root, rel);
    if (!abs.startsWith(root)) {
      return { ok: false, error: "path escapes knowledge root" };
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    fs.utimesSync(root, new Date(), new Date());
    return { ok: true, relPath: rel };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
