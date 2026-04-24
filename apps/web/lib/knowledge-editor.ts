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

export function listDocs(): DocMeta[] {
  return loadKnowledge().map((d) => d.meta);
}

export function getFullDoc(id: string): FullDoc | null {
  const d = loadKnowledge().find((x) => x.meta.id === id);
  if (!d) return null;
  return { meta: d.meta, body: d.rawContent };
}

export function writeDoc(
  id: string,
  updates: { fm: EditableFM; body: string }
): DocMeta {
  const root = knowledgeRoot();
  const current = loadKnowledge().find((x) => x.meta.id === id);
  if (!current) throw new EditorError("Không tìm thấy tài liệu");
  const abs = path.join(root, current.meta.path);

  validateFM(updates.fm);

  const rawFile = fs.readFileSync(abs, "utf8");
  const parsed = matter(rawFile);
  const prevSource = parsed.data.source ?? [];
  const newFM = {
    ...parsed.data,
    ...updates.fm,
    id: current.meta.id, // enforce immutable id
    source: prevSource,  // preserve source refs untouched
  };

  const output = matter.stringify(updates.body.trimEnd() + "\n", newFM);
  fs.writeFileSync(abs, output, "utf8");
  // Touch root dir so knowledge-loader's mtime cache invalidates.
  fs.utimesSync(root, new Date(), new Date());

  const next = loadKnowledge(true).find((x) => x.meta.id === id);
  if (!next) throw new EditorError("Ghi thành công nhưng reload thất bại");
  return next.meta;
}

export function deprecateDoc(id: string, reason: string): DocMeta {
  const current = getFullDoc(id);
  if (!current) throw new EditorError("Không tìm thấy tài liệu");
  const note = `\n\n> **Deprecated** — ${new Date().toISOString().slice(0, 10)}: ${reason}\n`;
  return writeDoc(id, {
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

export function createDoc(input: CreateDocInput): DocMeta {
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
  const root = knowledgeRoot();
  const target = path.join(root, input.path);
  if (fs.existsSync(target)) {
    throw new EditorError(`File đã tồn tại: ${input.path}`);
  }

  const newId = generateUlid();
  const fm = {
    id: newId,
    ...input.fm,
    source: [],
  };
  const output = matter.stringify(input.body.trimEnd() + "\n", fm);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output, "utf8");
  fs.utimesSync(root, new Date(), new Date());

  const refreshed = loadKnowledge(true).find((x) => x.meta.id === newId);
  if (!refreshed) {
    throw new EditorError("Tạo thành công nhưng reload thất bại");
  }
  return refreshed.meta;
}

/**
 * Hard delete: xoá file khỏi filesystem vĩnh viễn.
 * BẮT BUỘC password supervisor. Không gọi ngoài context admin.
 */
export function hardDeleteDoc(id: string, password: string): { deleted: string } {
  if (!ID_RE.test(id)) {
    throw new EditorError("ID không hợp lệ");
  }
  if (!verifyDestructivePassword(password)) {
    throw new EditorError("Mật khẩu xác nhận không đúng");
  }
  const root = knowledgeRoot();
  const doc = loadKnowledge().find((d) => d.meta.id === id);
  if (!doc) {
    throw new EditorError("Không tìm thấy tài liệu");
  }
  const abs = path.join(root, doc.meta.path);
  if (!abs.startsWith(root)) {
    throw new EditorError("Path sanity check failed");
  }
  fs.unlinkSync(abs);
  fs.utimesSync(root, new Date(), new Date());
  return { deleted: doc.meta.path };
}
