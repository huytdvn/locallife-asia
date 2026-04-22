import { GoogleGenAI } from "@google/genai";

/**
 * Gemini client cho Local Life Asia internal chat.
 *
 * Model chọn:
 *   - CHAT_MODEL (mặc định gemini-2.5-flash): chat + tool use.
 *   - FAST_MODEL (mặc định gemini-2.5-flash-lite): rerank/classify, nơi cần
 *     latency thấp hơn chất lượng.
 *
 * Context caching (Gemini Caches API): chưa bật ở Phase 1; enable khi
 * catalog > ~1000 doc hoặc system prompt > 32K token. Xem plan trong
 * lib/prompt.ts.
 */

if (!process.env.GEMINI_API_KEY) {
  // Fail early ở dev; build sẽ không lỗi, chỉ fail khi runtime gọi.
}

export const genai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY ?? "",
});

export const CHAT_MODEL = process.env.GEMINI_MODEL_CHAT ?? "gemini-2.5-flash";
export const FAST_MODEL =
  process.env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash-lite";
