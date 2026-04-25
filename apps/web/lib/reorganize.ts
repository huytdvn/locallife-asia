import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadKnowledge, knowledgeRoot } from "@/lib/knowledge-loader";
import { suggestClassify, improveBody } from "@/lib/ai-assist";
import { generateUlid } from "@/lib/knowledge-editor";
import type { DocMeta } from "@/lib/rbac";

/**
 * Plan-item cho bulk reorganize.
 *
 * Mỗi doc có 2 hành động khả dĩ:
 *   - Đổi path (move) nếu AI phân loại lại
 *   - Rewrite body theo văn phong doanh nghiệp (chuẩn hoá heading, bullet,
 *     giảm câu rườm rà, giữ nguyên dữ liệu)
 *
 * Trả về plan trước, user confirm rồi mới apply — tránh làm hỏng KB một
 * phát khi AI hallucinate.
 */
export interface ReorganizeItem {
  id: string;
  currentPath: string;
  currentTitle: string;
  newPath: string;
  newTitle: string;
  pathChanged: boolean;
  titleChanged: boolean;
  bodyChanged: boolean;
  /** Body cũ — dùng để render diff trong UI review. */
  currentBody?: string;
  /** Body mới sau khi AI rewrite — chỉ populate khi bodyChanged. */
  newBody?: string;
  reasoning: string;
  confidence: number;
  skipped?: string;
}

export interface ReorganizePlan {
  items: ReorganizeItem[];
  scanned: number;
  generatedAt: string;
}

export type ReorganizeMode = "classify-only" | "rewrite-and-move";

/**
 * Gọi Gemini classify + optional rewrite cho 1 doc.
 * Trả về plan-item (chưa apply).
 */
async function planOne(
  meta: DocMeta,
  body: string,
  mode: ReorganizeMode
): Promise<ReorganizeItem> {
  // Skip deprecated — không đụng vào để giữ history
  if (meta.status === "deprecated") {
    return {
      id: meta.id,
      currentPath: meta.path,
      currentTitle: meta.title,
      newPath: meta.path,
      newTitle: meta.title,
      pathChanged: false,
      titleChanged: false,
      bodyChanged: false,
      reasoning: "deprecated — bỏ qua",
      confidence: 0,
      skipped: "deprecated",
    };
  }

  const cls = await suggestClassify(meta.title, body);
  const currentZone = meta.path.split("/")[0];
  const currentDept = meta.path.split("/")[1] ?? "";

  // Suggest path. Nếu AI không confident (<3), giữ nguyên zone/dept.
  const useSuggest = cls.confidence >= 3;
  const newZone = useSuggest ? cls.zone : currentZone;
  const newDept = useSuggest ? cls.dept : currentDept;
  const newSub = useSuggest ? cls.subfolder : null;

  const filename = path.basename(meta.path);
  const parts = [newZone, newDept];
  if (newSub) parts.push(newSub);
  parts.push(filename);
  const newPath = parts.filter(Boolean).join("/");

  const pathChanged = newPath !== meta.path;
  const newTitle = (cls.title ?? meta.title).trim().slice(0, 140) || meta.title;
  const titleChanged = newTitle !== meta.title;

  let newBody: string | undefined;
  let currentBody: string | undefined;
  let bodyChanged = false;
  if (mode === "rewrite-and-move") {
    const rewritten = await improveBody(
      newTitle,
      body,
      "Chuẩn hoá văn phong doanh nghiệp Local Life Asia — lean, rõ, ấm. Thêm H2 cho từng mục chính, dùng bullet/bảng khi có data dạng list, rút gọn câu dài, giữ 100% dữ liệu gốc, không bịa. Giữ YAML front-matter nếu có.",
    );
    const normalized = rewritten.trim();
    if (normalized && normalized !== body.trim()) {
      newBody = normalized;
      currentBody = body;
      bodyChanged = true;
    }
  }

  return {
    id: meta.id,
    currentPath: meta.path,
    currentTitle: meta.title,
    newPath,
    newTitle,
    pathChanged,
    titleChanged,
    bodyChanged,
    currentBody,
    newBody,
    reasoning: cls.reasoning,
    confidence: cls.confidence,
  };
}

/**
 * Build plan cho toàn KB (hoặc 1 slice qua offset + limit).
 * `onProgress` callback để stream SSE (reserved cho future).
 *
 * Pagination dùng khi rewrite-mode vì mỗi doc mất ~10s qua Gemini —
 * 100 docs chạy 1 phát sẽ vượt route maxDuration. Client chunk theo
 * limit=30 là safe.
 */
export async function buildReorganizePlan(
  mode: ReorganizeMode,
  onProgress?: (done: number, total: number, currentPath: string) => void,
  limit?: number,
  offset: number = 0,
): Promise<ReorganizePlan & { hasMore: boolean; nextOffset: number }> {
  const docs = loadKnowledge();
  const start = Math.max(0, offset);
  const end = limit ? Math.min(docs.length, start + limit) : docs.length;
  const slice = docs.slice(start, end);
  const items: ReorganizeItem[] = [];
  for (let i = 0; i < slice.length; i++) {
    const d = slice[i];
    onProgress?.(i, slice.length, d.meta.path);
    try {
      const item = await planOne(d.meta, d.rawContent, mode);
      items.push(item);
    } catch (err) {
      items.push({
        id: d.meta.id,
        currentPath: d.meta.path,
        currentTitle: d.meta.title,
        newPath: d.meta.path,
        newTitle: d.meta.title,
        pathChanged: false,
        titleChanged: false,
        bodyChanged: false,
        reasoning: `AI lỗi: ${err instanceof Error ? err.message : String(err)}`,
        confidence: 0,
        skipped: "ai_error",
      });
    }
  }
  onProgress?.(slice.length, slice.length, "");
  return {
    items,
    scanned: slice.length,
    generatedAt: new Date().toISOString(),
    hasMore: end < docs.length,
    nextOffset: end,
  };
}

export interface ApplyResult {
  /** Số file được COPY sang path mới (bản gốc giữ nguyên). */
  copied: number;
  /** Số file có body được rewrite in-place. */
  rewrote: number;
  /** Số file có title được update (in-place hoặc trong copy). */
  titleUpdated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
  /** ID của các doc mới được tạo do copy. Admin có thể deprecate bản gốc sau. */
  createdIds: string[];
}

/**
 * Apply plan NON-DESTRUCTIVELY.
 *
 * Với items có `pathChanged`: COPY file sang path mới (kèm nội dung cập
 * nhật nếu có) — bản gốc giữ nguyên vẹn. File copy được gán **ULID mới**
 * để không trùng id với doc gốc, admin review xong rồi tự deprecate bản
 * cũ hoặc ngược lại.
 *
 * Với items chỉ đổi title/body (không đổi path): vẫn write in-place vì
 * không có chỗ khác để tạo bản copy an toàn. Git history giữ nguyên ràng
 * để roll-back.
 */
export function applyReorganizePlan(
  plan: ReorganizePlan,
  rootOverride?: string,
): ApplyResult {
  const root = rootOverride ?? knowledgeRoot();
  const result: ApplyResult = {
    copied: 0,
    rewrote: 0,
    titleUpdated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    createdIds: [],
  };

  for (const item of plan.items) {
    if (item.skipped) {
      result.skipped++;
      continue;
    }
    if (!item.pathChanged && !item.titleChanged && !item.bodyChanged) {
      result.skipped++;
      continue;
    }

    try {
      const currentAbs = path.join(root, item.currentPath);
      const targetAbs = path.join(root, item.newPath);

      if (!currentAbs.startsWith(root) || !targetAbs.startsWith(root)) {
        throw new Error("path escape detected");
      }
      if (!fs.existsSync(currentAbs)) {
        throw new Error("file missing");
      }

      const raw = fs.readFileSync(currentAbs, "utf8");
      const parsed = matter(raw);

      if (item.pathChanged) {
        // Non-destructive: copy source → target with content + title
        // changes baked in. Source file stays on disk intact. Copy gets
        // a NEW ULID so it's a distinct doc, not an id collision with
        // the original — admin manually deprecates whichever they reject.
        if (
          fs.existsSync(targetAbs) &&
          path.resolve(targetAbs) !== path.resolve(currentAbs)
        ) {
          throw new Error(`target already exists: ${item.newPath}`);
        }
        fs.mkdirSync(path.dirname(targetAbs), { recursive: true });

        const newId = generateUlid();
        const fmCopy = {
          ...parsed.data,
          id: newId,
          title: item.titleChanged ? item.newTitle : parsed.data.title,
          // Preserve provenance: note which doc this copy was derived from.
          derived_from: parsed.data.id ?? null,
        };
        const bodyForCopy =
          item.bodyChanged && item.newBody ? item.newBody : parsed.content;
        const outputCopy = matter.stringify(
          bodyForCopy.trimEnd() + "\n",
          fmCopy,
        );
        fs.writeFileSync(targetAbs, outputCopy, "utf8");

        result.copied++;
        result.createdIds.push(newId);
        if (item.titleChanged) result.titleUpdated++;
        if (item.bodyChanged) result.rewrote++;
      } else if (item.titleChanged || item.bodyChanged) {
        // No path change — in-place update. Git history gives us rollback,
        // and there's no unambiguous alternate location to copy to.
        const fm = { ...parsed.data };
        if (item.titleChanged) fm.title = item.newTitle;
        const bodyToWrite =
          item.bodyChanged && item.newBody ? item.newBody : parsed.content;
        const output = matter.stringify(bodyToWrite.trimEnd() + "\n", fm);
        fs.writeFileSync(currentAbs, output, "utf8");

        if (item.titleChanged) result.titleUpdated++;
        if (item.bodyChanged) result.rewrote++;
      }
    } catch (err) {
      result.failed++;
      result.errors.push({
        id: item.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Invalidate loader cache
  fs.utimesSync(root, new Date(), new Date());
  return result;
}
