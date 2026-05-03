import {
  MOTIVATION_LINES,
  CHECK_IN_LINES,
  HUMOR_BANK,
  pickRandom,
  type HumorQuestion,
} from "@/lib/onboarding/copy.vi";
import type { PopupType } from "@/lib/onboarding/popup-randomizer";

/**
 * Sinh content cho 1 popup theo type. Cho humor: trả `correctOption` để
 * caller persist vào DB cột `humor_correct_option` (KHÔNG render xuống
 * client trừ khi user đã trả lời).
 *
 * Pure: nhận RNG inject để test deterministic.
 */

export interface GeneratedPopup {
  type: PopupType;
  contentText: string;            // câu hỏi/message render cho user
  humorCorrectOption?: "A"|"B"|"C"|"D";
}

export function generatePopupContent(
  type: PopupType,
  rng: () => number = Math.random
): GeneratedPopup {
  if (type === "motivation") {
    return { type, contentText: pickRandom(MOTIVATION_LINES, rng) };
  }
  if (type === "check_in") {
    return { type, contentText: pickRandom(CHECK_IN_LINES, rng) };
  }
  // humor
  const q = pickRandom(HUMOR_BANK, rng);
  return {
    type,
    contentText: serializeHumor(q),
    humorCorrectOption: q.correct,
  };
}

/**
 * Serialize humor question thành 1 string JSON ngắn để lưu cột TEXT;
 * client parse ra render 4 button A/B/C/D.
 */
function serializeHumor(q: HumorQuestion): string {
  return JSON.stringify({
    q: q.q,
    options: q.options,
  });
}

export function parseHumor(contentText: string): HumorQuestion["options"] & { q: string } {
  return JSON.parse(contentText);
}
