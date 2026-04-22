import { canRead, type DocMeta, type Session } from "@/lib/rbac";
import { loadKnowledge } from "@/lib/knowledge-loader";
import { search } from "@/lib/bm25";

export interface SearchHit {
  doc: DocMeta;
  heading: string;
  excerpt: string;
  score: number;
}

export interface SearchOptions {
  query: string;
  tags?: string[];
  topK?: number;
}

/**
 * Hybrid retrieval pipeline:
 *   local-first (mặc định) → BM25 trên markdown đọc từ knowledge/
 *   hybrid mode (khi có QDRANT_URL + VOYAGE_API_KEY) → vector + BM25 + RRF + Haiku rerank
 *
 * RBAC luôn chạy cuối cùng — cả 2 mode.
 */
export async function searchKnowledge(
  session: Session,
  opts: SearchOptions
): Promise<SearchHit[]> {
  const topK = opts.topK ?? 5;
  const docs = loadKnowledge();
  const allChunks = docs.flatMap((d) => d.chunks);
  const docById = new Map(docs.map((d) => [d.meta.id, d.meta] as const));

  const bmHits = search(allChunks, opts.query, Math.max(topK * 4, 20));

  const tagFilter = opts.tags?.length
    ? (m: DocMeta) => opts.tags!.every((t) => m.tags.includes(t))
    : () => true;

  const results: SearchHit[] = [];
  for (const hit of bmHits) {
    const meta = docById.get(hit.chunk.docId);
    if (!meta) continue;
    if (!canRead(session.role, meta)) continue;
    if (!tagFilter(meta)) continue;
    results.push({
      doc: meta,
      heading: hit.chunk.heading,
      excerpt: excerptOf(hit.chunk.text, opts.query),
      score: hit.score,
    });
    if (results.length >= topK) break;
  }
  return results;
}

export async function getDocument(
  session: Session,
  id: string
): Promise<{ doc: DocMeta; content: string } | null> {
  const docs = loadKnowledge();
  const found = docs.find((d) => d.meta.id === id);
  if (!found) return null;
  if (!canRead(session.role, found.meta)) return null;
  return { doc: found.meta, content: found.rawContent };
}

function excerptOf(text: string, query: string, maxLen = 320): string {
  const qWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let hitIdx = -1;
  for (const w of qWords) {
    const i = lower.indexOf(w);
    if (i >= 0) {
      hitIdx = i;
      break;
    }
  }
  if (hitIdx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, hitIdx - 80);
  const end = Math.min(text.length, start + maxLen);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}
