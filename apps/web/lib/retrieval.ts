import { canRead, type DocMeta, type Session } from "@/lib/rbac";

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
 * Phase 0: stub trả về rỗng. Phase 1 sẽ thay bằng hybrid search thật:
 *   1. Embed query với Voyage-3 → vector search Qdrant (top 40)
 *   2. BM25 trên Postgres tsvector vi (top 40)
 *   3. Gộp + re-rank bằng Haiku (top 5)
 *   4. Filter qua canRead() trước khi trả ra
 *
 * Nguyên tắc: RBAC LUÔN chạy sau retrieval, không chỉ dựa prompt.
 */
export async function searchKnowledge(
  session: Session,
  opts: SearchOptions
): Promise<SearchHit[]> {
  void opts; // silence unused warning ở Phase 0
  const raw: SearchHit[] = []; // TODO(phase-1): hybrid retrieval
  return raw.filter((h) => canRead(session.role, h.doc));
}

export async function getDocument(
  session: Session,
  id: string
): Promise<{ doc: DocMeta; content: string } | null> {
  void id;
  void session;
  // TODO(phase-1): đọc từ knowledge/ (hoặc cache) + canRead guard
  return null;
}
