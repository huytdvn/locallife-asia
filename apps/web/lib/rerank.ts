import { genai, FAST_MODEL } from "@/lib/llm";
import type { SearchHit } from "@/lib/retrieval";

/**
 * Rerank top-K hits bằng Gemini Flash Lite — ít token, latency thấp,
 * cải thiện precision@1-3 đáng kể so với BM25 thuần.
 *
 * Best-effort: nếu LLM fail hoặc chưa có API key, trả về hits gốc
 * (không block retrieval).
 */
export async function rerankHits(
  query: string,
  hits: SearchHit[],
  keep: number
): Promise<SearchHit[]> {
  if (hits.length <= keep) return hits;
  if (!process.env.GEMINI_API_KEY) return hits.slice(0, keep);

  const candidates = hits.map((h, i) => ({
    i,
    title: h.doc.title,
    heading: h.heading,
    excerpt: h.excerpt.slice(0, 400),
  }));

  const prompt = `Đây là ${candidates.length} đoạn tài liệu ứng viên cho câu hỏi: "${query}".
Chọn ${keep} đoạn liên quan nhất, xếp từ phù hợp nhất xuống.
Trả về JSON array chỉ số i (0-based). Không giải thích.

Ứng viên:
${candidates
  .map(
    (c) =>
      `[${c.i}] ${c.title} / ${c.heading}\n${c.excerpt.replace(/\n+/g, " ")}\n`
  )
  .join("\n")}`;

  try {
    const response = await genai.models.generateContent({
      model: FAST_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });
    const raw = response.text?.trim() ?? "[]";
    const idx = JSON.parse(raw) as number[];
    const seen = new Set<number>();
    const out: SearchHit[] = [];
    for (const i of idx) {
      if (seen.has(i) || i < 0 || i >= hits.length) continue;
      seen.add(i);
      out.push(hits[i]);
      if (out.length >= keep) break;
    }
    // Fallback bổ sung bằng BM25 nếu LLM trả ít hơn keep.
    for (const h of hits) {
      if (out.length >= keep) break;
      if (!out.includes(h)) out.push(h);
    }
    return out;
  } catch (err) {
    console.warn("[rerank] failed, fallback BM25:", err);
    return hits.slice(0, keep);
  }
}
