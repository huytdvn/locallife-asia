import { genai, FAST_MODEL, CHAT_MODEL } from "@/lib/llm";
import { loadKnowledge } from "@/lib/knowledge-loader";
import type { DocMeta } from "@/lib/rbac";

const TAXONOMY_NOTE = `
TAXONOMY:
- internal (staff only):
  - 00-company (vision, values, brand, pháp lý công ty)
  - 10-hr (onboarding, policies, forms cho nhân viên)
  - 20-operations (SOP, quy trình nội bộ, playbooks)
  - 30-product (tiêu chuẩn chất lượng nhìn từ góc nội bộ)
  - 40-partners (hồ sơ meta của đối tác)
  - 50-finance (pricing, hợp đồng ký, tài khoản, giấy tờ công ty — restricted)
- host (host partner portal):
  - onboarding / standards / policies / faq
- lok (LOK partner portal):
  - program / onboarding / training / faq
- public (mọi user đã login):
  - about / terms / faq
`;

export interface ClassifySuggestion {
  zone: "internal" | "host" | "lok" | "public";
  dept: string;
  subfolder: string | null;
  title: string;
  tags: string[];
  audience: string[];
  sensitivity: "public" | "internal" | "restricted";
  reasoning: string;
  confidence: number; // 1-5
}

export async function suggestClassify(
  title: string,
  body: string
): Promise<ClassifySuggestion> {
  const excerpt = body.slice(0, 5000);
  const prompt = `Bạn là trợ lý phân loại tài liệu Local Life Asia.
${TAXONOMY_NOTE}

Tài liệu hiện tại:
Tiêu đề: ${title}
Nội dung:
---
${excerpt}
---

Trả về JSON duy nhất:
{
  "zone": "internal" | "host" | "lok" | "public",
  "dept": "<key dept phù hợp trong zone>",
  "subfolder": "<tên subfolder>" | null,
  "title": "tiêu đề ngắn gọn (<=80 ký tự) tiếng Việt đã refine",
  "tags": ["4-6 tag snake_case tiếng Anh không dấu"],
  "audience": ["employee"|"lead"|"admin"|"host"|"lok"|"guest"],
  "sensitivity": "public"|"internal"|"restricted",
  "reasoning": "1-2 câu tại sao phân vào đây",
  "confidence": 1-5
}`;
  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  const data = JSON.parse((resp.text ?? "{}").trim());
  return {
    zone: data.zone ?? "internal",
    dept: data.dept ?? "00-company",
    subfolder: data.subfolder ?? null,
    title: data.title ?? title,
    tags: Array.isArray(data.tags) ? data.tags : [],
    audience: Array.isArray(data.audience) ? data.audience : ["employee"],
    sensitivity: data.sensitivity ?? "internal",
    reasoning: data.reasoning ?? "",
    confidence: Number(data.confidence ?? 3),
  };
}

export async function improveBody(
  title: string,
  body: string,
  instruction: string
): Promise<string> {
  const prompt = `Bạn là biên tập viên nội dung Local Life Asia. Hãy cải thiện bản markdown sau theo yêu cầu, GIỮ NGUYÊN ý + dữ liệu, chỉ tối ưu trình bày.

Yêu cầu chỉnh sửa: ${instruction || "Cải thiện chung: sửa lỗi chính tả, thêm heading H2 cho từng mục chính, dùng bullet/bảng khi phù hợp, rút gọn câu rườm rà, giữ dấu tiếng Việt, giữ citations nếu có."}

Tiêu đề: ${title}

Markdown hiện tại:
---
${body.slice(0, 12000)}
---

TRẢ VỀ markdown đã cải thiện, KHÔNG kèm giải thích. Không đổi ý nghĩa. Không bịa thông tin. Không thêm front-matter (FM).`;
  const resp = await genai.models.generateContent({
    model: CHAT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return (resp.text ?? "").trim();
}

export async function suggestTags(
  title: string,
  body: string,
  existingTags: string[]
): Promise<string[]> {
  const prompt = `Đề xuất 5-8 tag snake_case tiếng Anh không dấu cho doc sau. JSON array duy nhất.
Tag đã có: ${existingTags.join(", ") || "(chưa có)"}
Tiêu đề: ${title}
Nội dung (excerpt): ${body.slice(0, 3000)}`;
  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  const arr = JSON.parse((resp.text ?? "[]").trim());
  return Array.isArray(arr) ? arr.map(String) : [];
}

export async function summarize(title: string, body: string): Promise<string> {
  const prompt = `Viết tóm tắt 2-3 câu tiếng Việt cho doc sau, focus vào:
1. Đây là tài liệu gì (loại + mục đích)
2. Người đọc chính sẽ làm gì sau khi đọc
3. Con số / con người / thời điểm quan trọng (nếu có)

Tiêu đề: ${title}
Nội dung:
---
${body.slice(0, 6000)}
---

Trả về CHỈ đoạn tóm tắt, không prefix "Tóm tắt:".`;
  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return (resp.text ?? "").trim();
}

export interface SimilarDoc {
  id: string;
  title: string;
  path: string;
  similarity: number; // 0-1
  reason: string;
}

/**
 * Tìm docs tương tự: dùng tokenize + jaccard title + body prefix.
 * Chạy offline (không gọi Gemini), nhanh & free.
 */
export function findSimilar(
  currentId: string,
  currentTitle: string,
  currentBody: string,
  limit = 5
): SimilarDoc[] {
  const docs = loadKnowledge();
  const currentTokens = new Set(tokenize(currentTitle + " " + currentBody.slice(0, 2000)));
  const scored: Array<{ meta: DocMeta; score: number; titleSim: number }> = [];
  for (const d of docs) {
    if (d.meta.id === currentId) continue;
    if (d.meta.status === "deprecated") continue;
    const otherTokens = new Set(
      tokenize(d.meta.title + " " + d.rawContent.slice(0, 2000))
    );
    const inter = intersectSize(currentTokens, otherTokens);
    const union = currentTokens.size + otherTokens.size - inter;
    const jaccard = union > 0 ? inter / union : 0;
    const titleSim = titleJaccard(currentTitle, d.meta.title);
    const score = jaccard * 0.4 + titleSim * 0.6;
    if (score >= 0.1) scored.push({ meta: d.meta, score, titleSim });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ meta, score, titleSim }) => ({
    id: meta.id,
    title: meta.title,
    path: meta.path,
    similarity: Math.round(score * 100) / 100,
    reason:
      titleSim > 0.7
        ? "Tiêu đề rất giống — có thể trùng"
        : score > 0.35
          ? "Nội dung overlap nhiều"
          : "Có điểm chung",
  }));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function titleJaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  const inter = intersectSize(sa, sb);
  const union = sa.size + sb.size - inter;
  return union > 0 ? inter / union : 0;
}

function intersectSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}
