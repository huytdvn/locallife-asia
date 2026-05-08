import { z } from "zod";
import { genai, CHAT_MODEL, FAST_MODEL } from "@/lib/llm";
import { searchKnowledge } from "@/lib/retrieval";
import { loadKnowledge } from "@/lib/knowledge-loader";
import { canRead, type Session } from "@/lib/rbac";

/**
 * Cross-doc AI planner — 1 instruction → propose changes across many docs.
 *
 * Two phases, each one Gemini call (the rewrite phase fans out):
 *   1. filter: "ở đây là 20 candidate docs, pick những doc nào cần đụng và operation gì"
 *   2. rewrite: per-doc, gen new markdown body (parallel)
 *
 * RBAC: caller phải là admin. Search bên dưới đã filter theo `canRead(session.role, ...)`.
 * Vì admin đọc được mọi sensitivity, planner thấy hết KB.
 */

export type Operation = "update" | "create" | "fm_update" | "deprecate";

export interface ProposedChange {
  /** Stable client-side ID = docId for existing, "new-{i}" for create. */
  key: string;
  operation: Operation;
  /** Tồn tại với update / fm_update / deprecate. */
  docId?: string;
  /** Hiển thị trong UI. */
  docTitle: string;
  docPath: string;
  /** newPath cho create. */
  newPath?: string;
  /** Body markdown cũ (no FM) — để diff với newBody. */
  oldBody?: string;
  /** Body markdown mới (no FM). */
  newBody?: string;
  /** Patch front-matter (chỉ field thay đổi). */
  fmPatch?: Partial<{
    title: string;
    tags: string[];
    audience: string[];
    sensitivity: "public" | "internal" | "restricted";
    last_reviewed: string;
    status: "draft" | "approved" | "deprecated";
  }>;
  /** Deprecate reason. */
  deprecateReason?: string;
  /** AI giải thích vì sao đổi doc này. */
  rationale: string;
  /** AI confidence 1-5. */
  confidence: number;
}

const FilterDecisionSchema = z.object({
  doc_id: z.string(),
  operation: z.enum(["update", "fm_update", "deprecate", "skip"]),
  reason: z.string(),
  confidence: z.number().int().min(1).max(5),
  fm_patch: z
    .object({
      tags: z.array(z.string()).optional(),
      audience: z.array(z.string()).optional(),
      sensitivity: z.enum(["public", "internal", "restricted"]).optional(),
      last_reviewed: z.string().optional(),
      status: z.enum(["draft", "approved", "deprecated"]).optional(),
    })
    .optional(),
});

const FilterOutputSchema = z.object({
  decisions: z.array(FilterDecisionSchema),
  create_new: z
    .array(
      z.object({
        path: z.string(),
        title: z.string(),
        reason: z.string(),
        outline: z.string(),
        confidence: z.number().int().min(1).max(5),
      })
    )
    .optional(),
});

const FILTER_PROMPT = (instruction: string, candidates: string) => `Bạn là "AI Tổng Thể" — quản lý tri thức cross-doc cho Local Life Asia.

YÊU CẦU TỪ ADMIN:
"""
${instruction}
"""

DANH SÁCH CANDIDATE DOCS (đã filter theo BM25 cho yêu cầu trên, sắp theo điểm relevance):
${candidates}

NHIỆM VỤ:
1. Quyết định doc nào CẦN ĐỤNG (operation: update | fm_update | deprecate). Chỉ chọn doc thật sự liên quan — khắt khe hơn là cẩu thả.
2. Có thể đề xuất tạo doc mới (create_new) NẾU yêu cầu cần thông tin chưa có.
3. Mỗi quyết định kèm reason ngắn (1 câu) và confidence 1-5.

CHỌN OPERATION:
- update: nội dung markdown body cần sửa
- fm_update: chỉ cần đổi front-matter (tags / audience / sensitivity / last_reviewed / status). Trả fm_patch chỉ với field cần đổi.
- deprecate: doc lỗi thời do yêu cầu này
- skip: không liên quan

QUY TẮC:
- Mặc định KHẮT KHE: skip nếu không chắc.
- 1 doc 1 quyết định.
- Đối với create_new: path phải bắt đầu bằng internal/ host/ lok/ public/ và kết thúc .md. Outline ≤ 200 ký tự, là gạch đầu dòng nói rõ doc mới sẽ chứa gì.

TRẢ JSON DUY NHẤT:
{
  "decisions": [
    {"doc_id": "...", "operation": "update|fm_update|deprecate|skip", "reason": "...", "confidence": 1-5, "fm_patch": {...nếu fm_update}}
  ],
  "create_new": [
    {"path": "internal/.../slug.md", "title": "...", "reason": "...", "outline": "- bullet1\\n- bullet2", "confidence": 1-5}
  ]
}`;

const REWRITE_PROMPT = (
  instruction: string,
  docTitle: string,
  oldBody: string,
  reason: string
) => `Bạn là biên tập viên KB. Đang xử lý 1 doc trong batch cross-doc edit.

YÊU CẦU TỔNG: ${instruction}
LÝ DO ĐỤNG DOC NÀY: ${reason}

Tiêu đề doc: ${docTitle}

Markdown body hiện tại (không kèm FM):
---
${oldBody.slice(0, 12000)}
---

NHIỆM VỤ:
- Áp đúng yêu cầu vào doc này, NHẤT QUÁN với toàn batch.
- Giữ nguyên cấu trúc heading + ý chính.
- KHÔNG bịa số liệu, ngày, tên người, link.
- KHÔNG đổi front-matter (sẽ xử lý riêng).
- Giữ tiếng Việt có dấu, citations nếu có.

TRẢ VỀ markdown body mới, KHÔNG kèm FM, KHÔNG kèm giải thích.`;

const NEW_DOC_PROMPT = (
  instruction: string,
  title: string,
  outline: string
) => `Soạn markdown body cho doc MỚI trong KB Local Life Asia.

YÊU CẦU TỔNG: ${instruction}
TIÊU ĐỀ: ${title}
OUTLINE:
${outline}

Yêu cầu:
- Tiếng Việt có dấu, giọng văn nội bộ chuyên nghiệp.
- Heading H2 (##) cho từng mục chính.
- Dùng bullet/bảng khi phù hợp.
- KHÔNG bịa số liệu / ngày / người / link cụ thể — dùng placeholder rõ ràng [TODO] nếu thiếu thông tin.
- KHÔNG kèm front-matter, KHÔNG kèm giải thích.

TRẢ VỀ markdown body.`;

interface PlanInput {
  session: Session;
  instruction: string;
  /** Limit candidate docs (BM25 top-k) trước khi gửi vào Gemini. */
  topK?: number;
}

export async function planCrossDocChanges(input: PlanInput): Promise<{
  changes: ProposedChange[];
  candidates_count: number;
}> {
  const { session, instruction } = input;
  const topK = input.topK ?? 20;

  // Phase 0: BM25 search để giảm candidate.
  const hits = await searchKnowledge(session, { query: instruction, topK });

  // Dedupe theo docId (search trả ra theo chunk; nhiều chunk cùng doc).
  const seen = new Set<string>();
  const uniqueDocs: Array<{ id: string; title: string; path: string }> = [];
  for (const h of hits) {
    if (seen.has(h.doc.id)) continue;
    seen.add(h.doc.id);
    uniqueDocs.push({ id: h.doc.id, title: h.doc.title, path: h.doc.path });
  }

  if (uniqueDocs.length === 0) {
    return { changes: [], candidates_count: 0 };
  }

  // Build candidate block — title + path + 400-char excerpt.
  const allDocs = loadKnowledge();
  const docsById = new Map(allDocs.map((d) => [d.meta.id, d] as const));
  const candidateBlock = uniqueDocs
    .map((d, i) => {
      const full = docsById.get(d.id);
      const excerpt = full ? full.rawContent.slice(0, 400).replace(/\n+/g, " ") : "";
      return `[${i + 1}] doc_id=${d.id}
    title: ${d.title}
    path: ${d.path}
    excerpt: ${excerpt}`;
    })
    .join("\n\n");

  // Phase 1: filter — ask Gemini which docs to touch.
  const filterResp = await genai.models.generateContent({
    model: CHAT_MODEL,
    contents: [
      { role: "user", parts: [{ text: FILTER_PROMPT(instruction, candidateBlock) }] },
    ],
    config: { responseMimeType: "application/json" },
  });
  let filterParsed: z.infer<typeof FilterOutputSchema>;
  try {
    filterParsed = FilterOutputSchema.parse(JSON.parse((filterResp.text ?? "{}").trim()));
  } catch {
    return { changes: [], candidates_count: uniqueDocs.length };
  }

  // Build ProposedChange list. update operations need rewrite phase.
  const changes: ProposedChange[] = [];

  // 1. fm_update + deprecate — không cần Gemini round 2.
  for (const d of filterParsed.decisions) {
    if (d.operation === "skip") continue;
    const full = docsById.get(d.doc_id);
    if (!full) continue;
    if (!canRead(session.role, full.meta)) continue;

    if (d.operation === "fm_update") {
      changes.push({
        key: d.doc_id,
        operation: "fm_update",
        docId: d.doc_id,
        docTitle: full.meta.title,
        docPath: full.meta.path,
        fmPatch: d.fm_patch,
        rationale: d.reason,
        confidence: d.confidence,
      });
    } else if (d.operation === "deprecate") {
      changes.push({
        key: d.doc_id,
        operation: "deprecate",
        docId: d.doc_id,
        docTitle: full.meta.title,
        docPath: full.meta.path,
        deprecateReason: d.reason,
        rationale: d.reason,
        confidence: d.confidence,
      });
    }
  }

  // 2. update — fan out to rewrite phase, parallel.
  const updateDecisions = filterParsed.decisions.filter((d) => d.operation === "update");
  const rewriteResults = await Promise.all(
    updateDecisions.map(async (d) => {
      const full = docsById.get(d.doc_id);
      if (!full) return null;
      if (!canRead(session.role, full.meta)) return null;
      try {
        const resp = await genai.models.generateContent({
          model: CHAT_MODEL,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: REWRITE_PROMPT(
                    instruction,
                    full.meta.title,
                    full.rawContent,
                    d.reason
                  ),
                },
              ],
            },
          ],
        });
        const newBody = (resp.text ?? "").trim();
        if (!newBody || newBody === full.rawContent.trim()) return null;
        return {
          decision: d,
          full,
          newBody,
        };
      } catch {
        return null;
      }
    })
  );
  for (const r of rewriteResults) {
    if (!r) continue;
    changes.push({
      key: r.decision.doc_id,
      operation: "update",
      docId: r.decision.doc_id,
      docTitle: r.full.meta.title,
      docPath: r.full.meta.path,
      oldBody: r.full.rawContent,
      newBody: r.newBody,
      rationale: r.decision.reason,
      confidence: r.decision.confidence,
    });
  }

  // 3. create_new — gen body in parallel.
  const createDecisions = filterParsed.create_new ?? [];
  const createResults = await Promise.all(
    createDecisions.map(async (c, i) => {
      const zoneOk = /^(internal|host|lok|public|inbox)\//.test(c.path);
      if (!zoneOk || !c.path.endsWith(".md")) return null;
      try {
        const resp = await genai.models.generateContent({
          model: CHAT_MODEL,
          contents: [
            {
              role: "user",
              parts: [{ text: NEW_DOC_PROMPT(instruction, c.title, c.outline) }],
            },
          ],
        });
        const body = (resp.text ?? "").trim();
        if (!body) return null;
        return {
          c,
          body,
          idx: i,
        };
      } catch {
        return null;
      }
    })
  );
  for (const r of createResults) {
    if (!r) continue;
    changes.push({
      key: `new-${r.idx}`,
      operation: "create",
      docTitle: r.c.title,
      docPath: r.c.path,
      newPath: r.c.path,
      newBody: r.body,
      rationale: r.c.reason,
      confidence: r.c.confidence,
    });
  }

  return { changes, candidates_count: uniqueDocs.length };
}

/** Compact one-shot summary of an instruction — for audit metadata + commit msg. */
export async function summarizeInstruction(instruction: string): Promise<string> {
  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Tóm tắt instruction sau thành ≤80 ký tự, dạng commit-message tiếng Việt, không prefix:
"${instruction}"`,
          },
        ],
      },
    ],
  });
  const t = (resp.text ?? "").trim().replace(/\n+/g, " ");
  return t.slice(0, 80) || "AI tổng thể batch update";
}
