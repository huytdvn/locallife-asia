/**
 * AI helpers cho admin builders (onboarding flow + training quiz).
 *
 * Tone: vui vẻ, có "motto" hype để gắn vào header khi user học. Mục tiêu
 * KHÔNG phải sinh content mới (đó là việc của knowledge_task), mà là biên
 * tập lại knowledge sẵn có thành lộ trình / quiz.
 */

import { genai, FAST_MODEL, CHAT_MODEL } from "@/lib/llm";
import { loadKnowledge } from "@/lib/knowledge-loader";
import { slugifyHeading } from "@/lib/admin-builders/slug";
import type { Role } from "@/lib/rbac";

// ────────────────────────────────────────────────────────────────────
// Onboarding builder
// ────────────────────────────────────────────────────────────────────

export interface OnboardingIdea {
  title: string;
  motto: string;       // 1 câu hype cảm xúc
  why: string;         // 1-2 câu giải thích vì sao đề xuất
  rough_steps: string[]; // 3-5 bullet ngắn cho user thấy roadmap
}

/**
 * "Lười nghĩ ý tưởng?" Bấm nút này → AI đọc knowledge base + đề xuất 3
 * lộ trình onboarding khác nhau. Admin pick 1 → vào pipeline generate.
 */
export async function suggestOnboardingIdeas(params: {
  audienceRole: Role;
  level?: "entry" | "mid" | "senior";
}): Promise<OnboardingIdea[]> {
  const { audienceRole, level = "entry" } = params;
  const docs = loadKnowledge();
  // Compact catalog: chỉ lấy 60 doc + tag để giữ token thấp
  const catalog = docs
    .filter((d) => d.meta.status === "approved")
    .slice(0, 60)
    .map((d) => `- ${d.meta.path} :: ${d.meta.title} :: tags=${d.meta.tags.join(",")}`)
    .join("\n");

  const prompt = `Bạn là bạn đồng hành onboarding tại Local Life Asia. Nhiệm vụ: đề xuất 3 lộ trình onboarding khác nhau cho ${audienceRole} (level ${level}). Tone: ấm áp, có cảm xúc, không khô. Mỗi motto như một lời chào: ngắn, gọn, có chút hài hoặc tự hào.

Catalog tài liệu hiện có (snippet):
${catalog}

Trả về DUY NHẤT JSON array 3 phần tử:
[
  {
    "title": "Tên lộ trình ngắn (≤ 60 ký tự)",
    "motto": "1 câu hype gọi cảm xúc, ≤ 100 ký tự, có emoji nếu phù hợp",
    "why": "1-2 câu giải thích vì sao chọn chủ đề này cho ${audienceRole} mới",
    "rough_steps": ["bước 1 ngắn gọn", "bước 2", "bước 3", "bước 4 (tuỳ chọn)"]
  }
]
Không thêm field khác. Không markdown wrapper.`;

  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  const arr = JSON.parse((resp.text ?? "[]").trim());
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 3).map((it): OnboardingIdea => ({
    title: String(it?.title ?? "").slice(0, 80),
    motto: String(it?.motto ?? "").slice(0, 140),
    why: String(it?.why ?? "").slice(0, 280),
    rough_steps: Array.isArray(it?.rough_steps)
      ? it.rough_steps.map(String).slice(0, 6)
      : [],
  }));
}

export interface OnboardingDocRef {
  doc_path: string;
  heading_anchor: string | null;
  highlight: string;
  reason: string;
}

export interface OnboardingQuestion {
  prompt: string;
  expected_keywords: string[];
  min_keywords: number;
}

export interface OnboardingStepDraft {
  goal: string;
  intro: string;
  pass_criteria: string;
  docs: OnboardingDocRef[];
  questions: OnboardingQuestion[];
}

export interface OnboardingFlowDraft {
  title: string;
  motto: string;
  pass_threshold: number; // 0-100
  steps: OnboardingStepDraft[];
}

/**
 * Sinh full flow từ:
 *   - brief: ý tưởng admin tự type
 *   - hoặc seed từ OnboardingIdea đã pick
 *
 * Mỗi step được "khoá" vào knowledge có thật — model bị bắt buộc chỉ chọn
 * doc_path từ catalog cung cấp. Heading anchor cũng phải khớp với chunker
 * H2 hiện tại (server validate sau).
 */
export async function generateOnboardingFlow(params: {
  brief: string;
  audienceRole: Role;
  level?: "entry" | "mid" | "senior";
  motto?: string;
}): Promise<OnboardingFlowDraft> {
  const { brief, audienceRole, level = "entry", motto } = params;
  const docs = loadKnowledge().filter((d) => d.meta.status === "approved");

  // Catalog đầy đủ hơn lúc generate flow — kèm danh sách H2 anchors để model
  // có thể tham chiếu đúng. Cap 80 doc tránh blow token.
  const catalog = docs.slice(0, 80).map((d) => {
    const headings = d.chunks
      .map((c) => c.heading)
      .filter((h) => h !== "Introduction")
      .slice(0, 8)
      .map((h) => `    - ${h} (#${slugifyHeading(h)})`)
      .join("\n");
    return `* ${d.meta.path} :: ${d.meta.title}\n${headings}`;
  }).join("\n");

  const prompt = `Bạn là người dựng lộ trình onboarding tại Local Life Asia. Tạo lộ trình cho ${audienceRole} (level ${level}) dựa trên brief admin cung cấp + catalog tài liệu sau.

BRIEF: ${brief}
${motto ? `MOTTO admin đã chọn (giữ nguyên hoặc tinh lại): ${motto}` : ""}

CATALOG (path :: title; với các heading H2 + slug anchor):
${catalog}

YÊU CẦU:
- Chia 3-5 step, mỗi step có goal rõ ràng + intro markdown 2-3 câu mời mọc.
- Mỗi step gắn 1-3 doc THỰC SỰ trong catalog (đúng doc_path). heading_anchor là slug khớp với một H2 trong doc đó (KHÔNG bịa), hoặc null nếu chỉ cần đọc cả doc.
- highlight: trích 1-2 câu cốt lõi cần đọc (≤ 240 ký tự, tiếng Việt).
- 2-4 câu hỏi/step, có expected_keywords (3-6 từ khoá tiếng Việt thường) + min_keywords để chấm pass/fail.
- pass_criteria 1 câu, vd "Trả đúng ≥ 70% câu trong step này".
- pass_threshold tổng: 60-80.
- Tone: ấm áp, có cảm xúc nhỏ ở motto + intro. Không trang trọng quá.

Trả về DUY NHẤT JSON object:
{
  "title": "Tên lộ trình (≤ 80 ký tự)",
  "motto": "1 câu hype, ≤ 140 ký tự, có thể có emoji",
  "pass_threshold": <number 60-80>,
  "steps": [
    {
      "goal": "Mục tiêu step (1 câu)",
      "intro": "Đoạn intro markdown 2-3 câu",
      "pass_criteria": "vd: trả đúng ≥ 70% câu",
      "docs": [
        {
          "doc_path": "knowledge/...",
          "heading_anchor": "slug" | null,
          "highlight": "trích đoạn cốt lõi cần đọc",
          "reason": "1 câu vì sao đọc đoạn này"
        }
      ],
      "questions": [
        {
          "prompt": "Câu hỏi cụ thể",
          "expected_keywords": ["từ_khoá_1","từ_khoá_2"],
          "min_keywords": <number ≥ 1>
        }
      ]
    }
  ]
}
KHÔNG markdown wrapper, KHÔNG comment. JSON thuần.`;

  const resp = await genai.models.generateContent({
    model: CHAT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  const data = JSON.parse((resp.text ?? "{}").trim());

  // Server validate: doc_path phải tồn tại; heading_anchor (nếu có) phải
  // khớp với 1 H2 slug của doc. Lọc bỏ entry không hợp lệ thay vì throw —
  // admin sẽ thấy fewer entries và edit thêm.
  const docByPath = new Map(docs.map((d) => [d.meta.path, d]));

  return {
    title: String(data?.title ?? "Lộ trình onboarding").slice(0, 100),
    motto: String(data?.motto ?? motto ?? "").slice(0, 200),
    pass_threshold: clampInt(data?.pass_threshold, 60, 80, 70),
    steps: Array.isArray(data?.steps)
      ? data.steps.map((s: unknown): OnboardingStepDraft => {
          const o = s as Record<string, unknown>;
          return {
            goal: String(o?.goal ?? "").slice(0, 240),
            intro: String(o?.intro ?? "").slice(0, 800),
            pass_criteria: String(o?.pass_criteria ?? "").slice(0, 200),
            docs: Array.isArray(o?.docs)
              ? (o.docs as unknown[])
                  .map((d): OnboardingDocRef | null => {
                    const x = d as Record<string, unknown>;
                    const docPath = String(x?.doc_path ?? "");
                    const doc = docByPath.get(docPath);
                    if (!doc) return null;
                    let anchor: string | null = null;
                    const candidate = x?.heading_anchor;
                    if (typeof candidate === "string" && candidate.length > 0) {
                      const validAnchors = new Set(
                        doc.chunks.map((c) => slugifyHeading(c.heading))
                      );
                      anchor = validAnchors.has(candidate) ? candidate : null;
                    }
                    return {
                      doc_path: docPath,
                      heading_anchor: anchor,
                      highlight: String(x?.highlight ?? "").slice(0, 280),
                      reason: String(x?.reason ?? "").slice(0, 200),
                    };
                  })
                  .filter((x): x is OnboardingDocRef => x !== null)
              : [],
            questions: Array.isArray(o?.questions)
              ? (o.questions as unknown[]).map((q): OnboardingQuestion => {
                  const y = q as Record<string, unknown>;
                  const kws = Array.isArray(y?.expected_keywords)
                    ? (y.expected_keywords as unknown[]).map(String).slice(0, 8)
                    : [];
                  return {
                    prompt: String(y?.prompt ?? "").slice(0, 400),
                    expected_keywords: kws,
                    min_keywords: clampInt(y?.min_keywords, 1, kws.length || 1, 1),
                  };
                })
              : [],
          };
        })
      : [],
  };
}

// ────────────────────────────────────────────────────────────────────
// Training quiz builder
// ────────────────────────────────────────────────────────────────────

export interface QuizQuestionDraft {
  id: string;            // ulid-ish
  prompt: string;
  choices: string[];     // 4 options
  answer_idx: number;    // 0-3
  explanation: string;   // hiện sau khi chấm
}

export interface TrainingQuizDraft {
  title: string;
  motto: string;
  intro: string;
  questions: QuizQuestionDraft[];
  pass_threshold: number;
}

export async function generateTrainingQuiz(params: {
  docPaths: string[];
  format: "quiz" | "reading" | "flashcard";
  audience: Role[];
  customInstruction?: string;
}): Promise<TrainingQuizDraft> {
  const { docPaths, format, audience, customInstruction } = params;
  const docs = loadKnowledge();
  const selected = docPaths
    .map((p) => docs.find((d) => d.meta.path === p))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  if (selected.length === 0) {
    throw new Error("Không có tài liệu nào hợp lệ trong list");
  }

  // Cap mỗi doc 4000 chars để giữ context.
  const sourceText = selected
    .map((d) => `### ${d.meta.title} (${d.meta.path})\n${d.rawContent.slice(0, 4000)}`)
    .join("\n\n---\n\n");

  const formatGuide =
    format === "quiz"
      ? "5-10 câu hỏi trắc nghiệm 4 đáp án, mỗi câu có 1 đáp án đúng + explanation 1-2 câu."
      : format === "reading"
        ? "5-7 câu hỏi mở; mỗi câu 'choices' có 1 đáp án mẫu + 3 lựa chọn 'gần đúng' để tự đối chiếu, explanation = đáp án mẫu chi tiết."
        : "8-12 cặp Q&A flashcard; mỗi flashcard có 4 choices: 1 đúng + 3 distract gần nghĩa, explanation = ghi chú để nhớ.";

  const prompt = `Bạn dựng quiz training cho Local Life Asia. Tone vui vẻ, có chút khích lệ. Audience: ${audience.join(", ")}.

NGUỒN (chỉ dùng nội dung trong nguồn, không bịa):
${sourceText}

${customInstruction ? `YÊU CẦU RIÊNG: ${customInstruction}` : ""}

Format: ${formatGuide}

Trả về DUY NHẤT JSON:
{
  "title": "Tên quiz ngắn (≤ 80 ký tự)",
  "motto": "1 câu hype cho user, ≤ 140 ký tự, có thể có emoji",
  "intro": "1 đoạn intro markdown 2-3 câu giải thích quiz nói về gì",
  "pass_threshold": <number 60-80>,
  "questions": [
    {
      "id": "<7 ký tự a-z0-9>",
      "prompt": "Câu hỏi",
      "choices": ["A","B","C","D"],
      "answer_idx": <0-3>,
      "explanation": "1-2 câu giải thích sau khi chấm"
    }
  ]
}
JSON thuần, không markdown wrapper.`;

  const resp = await genai.models.generateContent({
    model: CHAT_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });
  const data = JSON.parse((resp.text ?? "{}").trim());

  return {
    title: String(data?.title ?? "Training quiz").slice(0, 100),
    motto: String(data?.motto ?? "").slice(0, 200),
    intro: String(data?.intro ?? "").slice(0, 600),
    pass_threshold: clampInt(data?.pass_threshold, 50, 90, 70),
    questions: Array.isArray(data?.questions)
      ? data.questions
          .map((q: unknown, i: number): QuizQuestionDraft | null => {
            const x = q as Record<string, unknown>;
            const choices = Array.isArray(x?.choices)
              ? (x.choices as unknown[]).map(String).slice(0, 4)
              : [];
            if (choices.length < 2) return null;
            const ans = clampInt(x?.answer_idx, 0, choices.length - 1, 0);
            return {
              id: String(x?.id ?? randomShortId(i)),
              prompt: String(x?.prompt ?? "").slice(0, 400),
              choices,
              answer_idx: ans,
              explanation: String(x?.explanation ?? "").slice(0, 400),
            };
          })
          .filter((q: QuizQuestionDraft | null): q is QuizQuestionDraft => q !== null)
      : [],
  };
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function clampInt(
  v: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function randomShortId(seed: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  let v = Date.now() + seed * 7919;
  for (let i = 0; i < 7; i++) {
    s += chars[v % chars.length];
    v = Math.floor(v / chars.length);
  }
  return s;
}
