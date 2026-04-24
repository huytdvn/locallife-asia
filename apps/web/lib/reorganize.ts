import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { loadKnowledge, knowledgeRoot } from "@/lib/knowledge-loader";
import { suggestClassify, improveBody } from "@/lib/ai-assist";
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
  newBody?: string; // chỉ populate khi rewrite
  reasoning: string;
  confidence: number;
  skipped?: string; // reason nếu bỏ qua
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
  let bodyChanged = false;
  if (mode === "rewrite-and-move") {
    const rewritten = await improveBody(
      newTitle,
      body,
      "Chuẩn hoá văn phong doanh nghiệp Local Life Asia — lean, rõ, ấm. Thêm H2 cho từng mục chính, dùng bullet/bảng khi có data dạng list, rút gọn câu dài, giữ 100% dữ liệu gốc, không bịa. Giữ YAML front-matter nếu có."
    );
    const normalized = rewritten.trim();
    if (normalized && normalized !== body.trim()) {
      newBody = normalized;
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
    newBody,
    reasoning: cls.reasoning,
    confidence: cls.confidence,
  };
}

/**
 * Build plan cho toàn KB (hoặc 1 slice).
 * `onProgress` callback để stream SSE.
 */
export async function buildReorganizePlan(
  mode: ReorganizeMode,
  onProgress?: (done: number, total: number, currentPath: string) => void,
  limit?: number
): Promise<ReorganizePlan> {
  const docs = loadKnowledge();
  const slice = limit ? docs.slice(0, limit) : docs;
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
  };
}

export interface ApplyResult {
  moved: number;
  rewrote: number;
  titleUpdated: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Apply plan: move file + rewrite body + update title trong FM.
 * Chỉ đụng file đã có trong plan.items (không dựa vào freshly loaded docs).
 */
export function applyReorganizePlan(plan: ReorganizePlan): ApplyResult {
  const root = knowledgeRoot();
  const result: ApplyResult = {
    moved: 0,
    rewrote: 0,
    titleUpdated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
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
      const fm = { ...parsed.data };
      if (item.titleChanged) {
        fm.title = item.newTitle;
        result.titleUpdated++;
      }
      const bodyToWrite = item.bodyChanged && item.newBody ? item.newBody : parsed.content;
      const output = matter.stringify(bodyToWrite.trimEnd() + "\n", fm);

      if (item.pathChanged) {
        fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
        if (fs.existsSync(targetAbs) && path.resolve(targetAbs) !== path.resolve(currentAbs)) {
          throw new Error(`target already exists: ${item.newPath}`);
        }
        fs.writeFileSync(targetAbs, output, "utf8");
        if (path.resolve(targetAbs) !== path.resolve(currentAbs)) {
          fs.unlinkSync(currentAbs);
        }
        result.moved++;
      } else {
        fs.writeFileSync(currentAbs, output, "utf8");
      }
      if (item.bodyChanged) result.rewrote++;
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
