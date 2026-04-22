import type { Chunk } from "@/lib/knowledge-loader";
import { tokenize } from "@/lib/knowledge-loader";

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

interface IndexState {
  chunks: Chunk[];
  df: Map<string, number>;
  avgDl: number;
  n: number;
}

let indexCache: { sig: string; state: IndexState } | null = null;

const K1 = 1.5;
const B = 0.75;

export function buildIndex(chunks: Chunk[]): IndexState {
  const sig = `${chunks.length}:${chunks[0]?.docId ?? ""}:${chunks.at(-1)?.docId ?? ""}`;
  if (indexCache && indexCache.sig === sig) return indexCache.state;

  const df = new Map<string, number>();
  let totalDl = 0;
  for (const c of chunks) {
    totalDl += c.tokens.length;
    const seen = new Set<string>();
    for (const t of c.tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const state: IndexState = {
    chunks,
    df,
    avgDl: chunks.length ? totalDl / chunks.length : 0,
    n: chunks.length,
  };
  indexCache = { sig, state };
  return state;
}

export function search(
  chunks: Chunk[],
  query: string,
  topK: number
): ScoredChunk[] {
  const state = buildIndex(chunks);
  const qTokens = Array.from(new Set(tokenize(query)));
  if (qTokens.length === 0) return [];

  const scored: ScoredChunk[] = [];
  for (const c of state.chunks) {
    const tf = new Map<string, number>();
    for (const t of c.tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of qTokens) {
      const f = tf.get(q);
      if (!f) continue;
      const n_q = state.df.get(q) ?? 0;
      const idf = Math.log(1 + (state.n - n_q + 0.5) / (n_q + 0.5));
      const dl = c.tokens.length;
      const norm = f * (K1 + 1);
      const denom = f + K1 * (1 - B + (B * dl) / (state.avgDl || 1));
      score += idf * (norm / denom);
    }
    if (score > 0) scored.push({ chunk: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
