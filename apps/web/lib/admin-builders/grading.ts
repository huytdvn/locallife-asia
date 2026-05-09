/**
 * Chấm bài onboarding flow — keyword-based.
 *
 * Mỗi câu hỏi có `expected_keywords[]` + `min_keywords`. Câu pass nếu user
 * trả lời chứa ≥ min_keywords keyword (bỏ dấu, lowercase). Step pass nếu
 * tỉ lệ câu pass ≥ pass_threshold của flow. Flow pass nếu tỉ lệ step pass
 * ≥ pass_threshold.
 *
 * Chỗ này KHÔNG dùng AI — keyword matching cố ý đơn giản + dễ giải thích
 * cho user. Sau này nếu cần "chấm thông minh" có thể thay bằng Gemini
 * eval, nhưng MVP keyword đủ.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

export function gradeAnswer(
  answer: string,
  expectedKeywords: string[],
  minKeywords: number
): { passed: boolean; matched: string[] } {
  const normalizedAnswer = normalize(answer);
  const matched: string[] = [];
  for (const kw of expectedKeywords) {
    if (!kw.trim()) continue;
    const nk = normalize(kw);
    if (normalizedAnswer.includes(nk)) {
      matched.push(kw);
    }
  }
  return {
    passed: matched.length >= Math.max(1, minKeywords),
    matched,
  };
}

export interface QuestionGrade {
  question_id: number;
  correct: boolean;
  /** Đáp án đúng nếu MC, null nếu keyword. */
  answer_idx: number | null;
  /** User chọn (MC) hoặc text (keyword). */
  user_answer: string | number | null;
  explanation: string | null;
}

export interface StepGrade {
  step_id: number;
  questions_total: number;
  questions_passed: number;
  score_pct: number;
  passed: boolean;
  /** Per-question detail để UI render checkmark + giải thích sau chấm. */
  question_grades: QuestionGrade[];
}

export interface FlowGrade {
  passed: boolean;
  score_pct: number;
  step_results: StepGrade[];
}

export interface FlowQuestionInput {
  question_id: number;
  /** MC: index user chọn (number). Keyword: text user gõ (string). null = bỏ trắng. */
  answer: string | number | null;
  /** MC fields (preferred). Nếu cả 2 NULL → fallback keyword. */
  choices?: string[] | null;
  answer_idx?: number | null;
  explanation?: string | null;
  /** Keyword fallback. */
  expected_keywords?: string[];
  min_keywords?: number;
}

export function gradeFlow(params: {
  passThreshold: number;
  steps: Array<{
    step_id: number;
    pass_threshold_pct?: number;
    questions: FlowQuestionInput[];
  }>;
}): FlowGrade {
  const stepResults: StepGrade[] = [];
  for (const step of params.steps) {
    let passedCount = 0;
    const qGrades: QuestionGrade[] = [];
    for (const q of step.questions) {
      const isMC = q.choices && q.choices.length > 0 && q.answer_idx !== null && q.answer_idx !== undefined;
      let correct = false;
      if (isMC) {
        const userIdx = typeof q.answer === "number" ? q.answer : Number(q.answer);
        correct = Number.isFinite(userIdx) && userIdx === q.answer_idx;
      } else {
        const userText = typeof q.answer === "string" ? q.answer : "";
        correct = gradeAnswer(
          userText,
          q.expected_keywords ?? [],
          q.min_keywords ?? 1
        ).passed;
      }
      if (correct) passedCount++;
      qGrades.push({
        question_id: q.question_id,
        correct,
        answer_idx: q.answer_idx ?? null,
        user_answer: q.answer,
        explanation: q.explanation ?? null,
      });
    }
    const total = step.questions.length;
    const pct = total > 0 ? Math.round((passedCount / total) * 100) : 0;
    const stepPassThreshold = step.pass_threshold_pct ?? params.passThreshold;
    stepResults.push({
      step_id: step.step_id,
      questions_total: total,
      questions_passed: passedCount,
      score_pct: pct,
      passed: pct >= stepPassThreshold,
      question_grades: qGrades,
    });
  }
  const passedSteps = stepResults.filter((s) => s.passed).length;
  const overallPct =
    stepResults.length > 0
      ? Math.round((passedSteps / stepResults.length) * 100)
      : 0;
  return {
    passed: overallPct >= params.passThreshold,
    score_pct: overallPct,
    step_results: stepResults,
  };
}

export interface QuizGrade {
  passed: boolean;
  score_pct: number;
  details: Array<{
    question_id: string;
    correct: boolean;
    chosen_idx: number;
    answer_idx: number;
    explanation: string;
  }>;
}

export function gradeQuiz(params: {
  passThreshold: number;
  questions: Array<{
    id: string;
    answer_idx: number;
    explanation: string;
  }>;
  answers: Array<{ question_id: string; choice_idx: number }>;
}): QuizGrade {
  const byId = new Map(params.questions.map((q) => [q.id, q]));
  let correctCount = 0;
  const details: QuizGrade["details"] = [];
  for (const a of params.answers) {
    const q = byId.get(a.question_id);
    if (!q) continue;
    const correct = a.choice_idx === q.answer_idx;
    if (correct) correctCount++;
    details.push({
      question_id: q.id,
      correct,
      chosen_idx: a.choice_idx,
      answer_idx: q.answer_idx,
      explanation: q.explanation,
    });
  }
  const total = params.questions.length;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  return {
    passed: pct >= params.passThreshold,
    score_pct: pct,
    details,
  };
}
