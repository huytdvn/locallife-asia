import fs from "node:fs";
import path from "node:path";
import { genai, FAST_MODEL } from "@/lib/llm";
import { loadKnowledge } from "@/lib/knowledge-loader";
import type { TrainingPath } from "@/lib/training";

/**
 * Quiz gen flow:
 *   1. `generateQuiz(slug, path)` → Gemini đọc nội dung các doc trong path,
 *      sinh 5 câu multiple choice, ghi vào `.cache/training/quizzes/<attempt_id>.json`
 *      (full với correct) và trả về client phiên bản masked (không có correct).
 *   2. Client submit answers với attempt_id → `scoreQuiz` đọc cache, chấm điểm.
 */

export interface QuizQuestion {
  q: string;
  options: string[]; // 4 options
  correct: number; // 0-3 (stored server-side only)
  explain?: string;
}

export interface Quiz {
  attempt_id: string;
  slug: string;
  created_at: string;
  email: string;
  questions: QuizQuestion[];
}

export type MaskedQuestion = Omit<QuizQuestion, "correct" | "explain">;

function quizFile(attemptId: string): string {
  const dir = path.resolve(process.cwd(), ".cache", "training", "quizzes");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${attemptId}.json`);
}

function generateUlid(): string {
  const chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const now = Date.now();
  let ts = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    ts = chars[t % 32] + ts;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += chars[Math.floor(Math.random() * 32)];
  return ts + rand;
}

const QUIZ_PROMPT = `Bạn là giáo viên ra đề. Đọc nội dung tài liệu sau (đã gộp),
soạn chính xác 5 câu multiple-choice để kiểm tra người học hiểu đúng.

QUY TẮC:
- Mỗi câu có 4 phương án, chỉ 1 đúng.
- Câu hỏi rõ ràng, không mơ hồ; option đều hợp lý (không có option-rác).
- Tránh câu hỏi suy diễn quá xa; tập trung các fact quan trọng / quyết định
  (số liệu, quy trình, deadline, tên phòng ban, role được/không được làm gì).
- Trộn thứ tự option — đừng để đáp án đúng luôn ở A.
- Tiếng Việt tự nhiên.

Trả về JSON duy nhất:
{
  "questions": [
    {
      "q": "câu hỏi?",
      "options": ["A", "B", "C", "D"],
      "correct": 0-3,
      "explain": "1 câu giải thích ngắn"
    }
  ]
}`;

export async function generateQuiz(
  email: string,
  trainingPath: TrainingPath
): Promise<{ attemptId: string; masked: MaskedQuestion[] }> {
  const docs = loadKnowledge();
  const byPath = new Map(docs.map((d) => [d.meta.path, d]));

  // Gộp nội dung docs trong path (tối đa 12000 chars)
  const pieces: string[] = [];
  let budget = 12000;
  for (const section of trainingPath.sections) {
    for (const step of section.steps) {
      const loaded = byPath.get(step.doc_path);
      if (!loaded) continue;
      const title = loaded.meta.title;
      const body = loaded.rawContent.slice(0, 1500);
      const chunk = `\n\n=== ${title} ===\n${body}`;
      if (budget - chunk.length < 0) break;
      pieces.push(chunk);
      budget -= chunk.length;
    }
    if (budget < 1000) break;
  }

  const joined = pieces.join("");
  const resp = await genai.models.generateContent({
    model: FAST_MODEL,
    contents: [
      QUIZ_PROMPT,
      `Tên lộ trình: ${trainingPath.title}\n\nNội dung:\n${joined}`,
    ],
    config: { responseMimeType: "application/json" },
  });
  const data = JSON.parse((resp.text ?? "{}").trim()) as {
    questions?: Array<{
      q: string;
      options: string[];
      correct: number;
      explain?: string;
    }>;
  };
  const questions = (data.questions ?? []).slice(0, 5).map((q) => ({
    q: String(q.q),
    options: (q.options ?? []).map(String).slice(0, 4),
    correct: Math.max(0, Math.min(3, Number(q.correct ?? 0))),
    explain: q.explain ? String(q.explain) : undefined,
  }));

  if (questions.length === 0) {
    throw new Error("AI không sinh được câu hỏi nào");
  }

  const attemptId = generateUlid();
  const quiz: Quiz = {
    attempt_id: attemptId,
    slug: trainingPath.slug,
    email,
    created_at: new Date().toISOString(),
    questions,
  };
  fs.writeFileSync(quizFile(attemptId), JSON.stringify(quiz, null, 2), "utf-8");

  return {
    attemptId,
    masked: questions.map((q) => ({ q: q.q, options: q.options })),
  };
}

export interface ScoredQuiz {
  attempt_id: string;
  slug: string;
  total: number;
  correct_count: number;
  score: number; // 0-1
  passed: boolean;
  pass_threshold: number;
  per_question: Array<{
    q: string;
    your_answer: number;
    correct_answer: number;
    is_correct: boolean;
    explain?: string;
  }>;
}

export const PASS_THRESHOLD = 0.8;

export function scoreQuiz(
  attemptId: string,
  answers: number[]
): ScoredQuiz {
  const file = quizFile(attemptId);
  if (!fs.existsSync(file)) {
    throw new Error("Attempt expired or not found");
  }
  const quiz = JSON.parse(fs.readFileSync(file, "utf-8")) as Quiz;
  const perQ = quiz.questions.map((q, i) => {
    const your = answers[i] ?? -1;
    return {
      q: q.q,
      your_answer: your,
      correct_answer: q.correct,
      is_correct: your === q.correct,
      explain: q.explain,
    };
  });
  const correctCount = perQ.filter((x) => x.is_correct).length;
  const total = quiz.questions.length;
  const score = total > 0 ? correctCount / total : 0;
  const passed = score >= PASS_THRESHOLD;
  return {
    attempt_id: attemptId,
    slug: quiz.slug,
    total,
    correct_count: correctCount,
    score,
    passed,
    pass_threshold: PASS_THRESHOLD,
    per_question: perQ,
  };
}
