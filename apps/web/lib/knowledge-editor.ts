import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadKnowledge, knowledgeRoot } from "@/lib/knowledge-loader";
import type { DocMeta, Role, Sensitivity } from "@/lib/rbac";

/** FM mà admin được phép sửa qua UI (không để sửa id). */
export interface EditableFM {
  title: string;
  owner: string;
  audience: Role[];
  sensitivity: Sensitivity;
  tags: string[];
  last_reviewed: string;
  reviewer: string;
  status: "draft" | "approved" | "deprecated";
  related?: string[];
}

export interface FullDoc {
  meta: DocMeta;
  body: string;
}

/** Output của các build* helpers — caller tự đẩy lên git. */
export interface BuiltUpdate {
  /** Đường dẫn tương đối trong repo, vd "knowledge/host/faq/abc.md" */
  repoPath: string;
  /** Nội dung file đầy đủ (FM + body) sẵn sàng commit */
  content: string;
  /** Meta dự kiến sau khi commit (path tương đối với knowledge root, không có prefix "knowledge/") */
  preview: DocMeta;
}

export function listDocs(): DocMeta[] {
  return loadKnowledge().map((d) => d.meta);
}

export function getFullDoc(id: string): FullDoc | null {
  const d = loadKnowledge().find((x) => x.meta.id === id);
  if (!d) return null;
  return { meta: d.meta, body: d.rawContent };
}

/**
 * Build markdown nội dung cho 1 update. KHÔNG ghi filesystem.
 * Caller chịu trách nhiệm push lên GitHub (tier 1) — ingest sync sẽ
 * cập nhật mount đọc (tier 2) + R2 (tier 3).
 *
 * Đọc file gốc qua loader cache để lấy front-matter cũ (giữ source[]).
 * Nếu mount RO thì việc đọc cache vẫn OK; chỉ writeFileSync mới fail.
 */
export function buildDocUpdate(
  id: string,
  updates: { fm: EditableFM; body: string }
): BuiltUpdate {
  const current = loadKnowledge().find((x) => x.meta.id === id);
  if (!current) throw new EditorError("Không tìm thấy tài liệu");

  validateFM(updates.fm);

  const root = knowledgeRoot();
  const abs = path.join(root, current.meta.path);
  const rawFile = fs.readFileSync(abs, "utf8");
  const parsed = matter(rawFile);
  const prevSource = parsed.data.source ?? [];
  const newFM = {
    ...parsed.data,
    ...updates.fm,
    id: current.meta.id, // enforce immutable id
    source: prevSource,  // preserve source refs untouched
  };

  const content = matter.stringify(updates.body.trimEnd() + "\n", newFM);
  const preview: DocMeta = {
    ...current.meta,
    title: updates.fm.title,
    owner: updates.fm.owner,
    audience: updates.fm.audience,
    sensitivity: updates.fm.sensitivity,
    tags: updates.fm.tags,
    last_reviewed: updates.fm.last_reviewed,
    reviewer: updates.fm.reviewer,
    status: updates.fm.status,
  };

  return {
    repoPath: toRepoPath(current.meta.path),
    content,
    preview,
  };
}

export function buildDeprecateUpdate(id: string, reason: string): BuiltUpdate {
  const current = getFullDoc(id);
  if (!current) throw new EditorError("Không tìm thấy tài liệu");
  const note = `\n\n> **Deprecated** — ${new Date().toISOString().slice(0, 10)}: ${reason}\n`;
  return buildDocUpdate(id, {
    fm: {
      title: current.meta.title,
      owner: current.meta.owner,
      audience: current.meta.audience,
      sensitivity: current.meta.sensitivity,
      tags: current.meta.tags,
      last_reviewed: current.meta.last_reviewed,
      reviewer: current.meta.reviewer,
      status: "deprecated",
    },
    body: current.body + note,
  });
}

function validateFM(fm: EditableFM): void {
  if (!fm.title?.trim()) throw new EditorError("Thiếu tiêu đề");
  if (!fm.owner?.includes("@"))
    throw new EditorError("Owner phải là email hợp lệ");
  if (!fm.audience?.length) throw new EditorError("Phải chọn ít nhất 1 audience");
  const validRoles: Role[] = ["employee", "lead", "admin"];
  if (fm.audience.some((a) => !validRoles.includes(a)))
    throw new EditorError("Audience không hợp lệ");
  if (!["public", "internal", "restricted"].includes(fm.sensitivity))
    throw new EditorError("Sensitivity không hợp lệ");
  if (!["draft", "approved", "deprecated"].includes(fm.status))
    throw new EditorError("Status không hợp lệ");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.last_reviewed))
    throw new EditorError("last_reviewed phải YYYY-MM-DD");
}

export class EditorError extends Error {}

/**
 * Verify supervisor password — constant-time compare SHA-256 hash.
 * Trả về true nếu mật khẩu khớp.
 */
export function verifyDestructivePassword(provided: string): boolean {
  const expectedHash = process.env.ADMIN_DESTRUCTIVE_PW_HASH;
  if (!expectedHash || expectedHash.length < 32) return false;
  const candidateHash = createHash("sha256")
    .update(provided, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(candidateHash, "hex");
    const b = Buffer.from(expectedHash.trim().toLowerCase(), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export interface CreateDocInput {
  path: string; // relative inside knowledge/, e.g., "internal/10-hr/onboarding/sales-w1.md"
  fm: EditableFM;
  body: string;
}

const ID_RE = /^[0-9A-Z]{26}$/;

export function generateUlid(): string {
  // Crockford base32, 48-bit timestamp + 80-bit randomness.
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const now = Date.now();
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = chars[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) {
    rand += chars[Math.floor(Math.random() * 32)];
  }
  return ts + rand;
}

/**
 * Build markdown nội dung cho 1 file mới. KHÔNG ghi filesystem.
 * Trả về repoPath + content để caller commit lên GitHub.
 *
 * Vẫn check trùng id qua loader cache (tier 2). Trùng path trên git
 * sẽ bị endpoint commit trả lỗi 409 — caller nên catch.
 */
export function buildCreateDoc(input: CreateDocInput): BuiltUpdate {
  validateFM(input.fm);
  if (!input.path.endsWith(".md")) {
    throw new EditorError("Path phải kết thúc bằng .md");
  }
  if (input.path.includes("..") || input.path.startsWith("/")) {
    throw new EditorError("Path không hợp lệ");
  }
  // Enforce knowledge base structure — must start with a valid zone folder.
  const zoneOk = /^(internal|host|lok|public|inbox)\//.test(input.path);
  if (!zoneOk) {
    throw new EditorError(
      "Path phải bắt đầu bằng internal/ host/ lok/ public/ hoặc inbox/"
    );
  }

  const newId = generateUlid();
  const fm = {
    id: newId,
    ...input.fm,
    source: [],
  };
  const content = matter.stringify(input.body.trimEnd() + "\n", fm);
  const preview: DocMeta = {
    id: newId,
    title: input.fm.title,
    owner: input.fm.owner,
    audience: input.fm.audience,
    sensitivity: input.fm.sensitivity,
    tags: input.fm.tags,
    last_reviewed: input.fm.last_reviewed,
    reviewer: input.fm.reviewer,
    status: input.fm.status,
    path: input.path,
  };
  return {
    repoPath: toRepoPath(input.path),
    content,
    preview,
  };
}

/**
 * Hard delete: file path để caller xoá khỏi git repo qua GitHub API.
 * BẮT BUỘC password supervisor.
 */
export function authorizeHardDelete(
  id: string,
  password: string
): { repoPath: string; relPath: string } {
  if (!ID_RE.test(id)) {
    throw new EditorError("ID không hợp lệ");
  }
  if (!verifyDestructivePassword(password)) {
    throw new EditorError("Mật khẩu xác nhận không đúng");
  }
  const doc = loadKnowledge().find((d) => d.meta.id === id);
  if (!doc) {
    throw new EditorError("Không tìm thấy tài liệu");
  }
  return { repoPath: toRepoPath(doc.meta.path), relPath: doc.meta.path };
}

/**
 * `meta.path` từ loader đã tương đối với knowledge root (không có "knowledge/").
 * GitHub API contents endpoint cần path tương đối với repo root.
 * Convention: repo lưu KB ở thư mục `knowledge/`.
 */
function toRepoPath(relInsideKnowledge: string): string {
  const prefix = process.env.KNOWLEDGE_REPO_SUBDIR ?? "knowledge";
  return prefix ? `${prefix}/${relInsideKnowledge}` : relInsideKnowledge;
}
