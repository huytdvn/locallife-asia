# Truy vấn — đường đi và hiệu năng

Tài liệu này mô tả **chuyện gì xảy ra từ lúc nhân viên gõ câu hỏi đến lúc
nhận được câu trả lời có citation**, và **vì sao nhanh**.

## Sequence (P50 ~1.0–1.8s đến token đầu, ~3–5s đến hết câu trả lời)

```
User                 Next.js          Claude (Sonnet 4.6)        Tools                Claude (Haiku 4.5)
 │                    │                       │                     │                          │
 │── question ───────►│                       │                     │                          │
 │                    │── /api/chat (SSE) ───►│                     │                          │
 │                    │   system (CACHED) +   │                     │                          │
 │                    │   user msgs           │                     │                          │
 │                    │                       │                     │                          │
 │                    │                       │── tool_use ────────►│ search_knowledge(q)      │
 │                    │                       │                     │  ├─ embed q (Voyage-3)   │
 │                    │                       │                     │  ├─ Qdrant vector ──┐    │
 │                    │                       │                     │  ├─ Postgres BM25 ──┤    │
 │                    │                       │                     │  │   (parallel)     │    │
 │                    │                       │                     │  ├─ merge top-20    │    │
 │                    │                       │                     │  ├─ canRead() filter│    │
 │                    │                       │                     │  └─ rerank top-5 ───┼───►│ score 20 candidates
 │                    │                       │                     │                     │◄───│
 │                    │                       │◄─ tool_result ──────│                          │
 │                    │                       │   (5 chunks +       │                          │
 │                    │                       │    citations)       │                          │
 │                    │                       │                     │                          │
 │                    │◄─ stream tokens ──────│                     │                          │
 │◄── stream + cite ──│                       │                     │                          │
```

## Cài đặt cụ thể

### 1. Indexing (chạy 1 lần lúc ingest, không phải lúc query)

Khi pipeline commit doc mới vào `knowledge/`:

```python
# apps/ingest/app/pipeline/embed.py (Phase 1-2)
chunks = chunk_by_heading(markdown, overlap_ratio=0.15)   # split theo H1/H2
for c in chunks:
    vec = voyage.embed(c.text, model="voyage-3", input_type="document")
    qdrant.upsert(point_id=c.id, vector=vec, payload={
        "doc_id": doc.id,
        "doc_path": doc.path,
        "heading": c.heading,
        "audience": doc.audience,           # → filter ở query
        "sensitivity": doc.sensitivity,
        "tags": doc.tags,
        "text": c.text,
    })
postgres.upsert_tsvector(c.id, vietnamese_tokenize(c.text))
```

**Điểm quan trọng**: embedding làm **lúc ingest**, không phải lúc query.
Query chỉ embed mỗi câu hỏi (ngắn, ~80ms).

### 2. Query path (chạy mỗi câu hỏi)

```typescript
// apps/web/lib/retrieval.ts (Phase 1)
async function searchKnowledge(session, { query, tags, topK = 5 }) {
  // 2a. Embed query (1 round-trip Voyage-3)
  const qVec = await voyage.embed(query, { input_type: "query" });

  // 2b. Vector + BM25 chạy song song (không tuần tự)
  const [vectorHits, bm25Hits] = await Promise.all([
    qdrant.search({
      vector: qVec,
      limit: 20,
      filter: { must: [
        { key: "audience", match: { any: session.audience } },
      ]},
    }),
    postgres.query(`
      SELECT id, ts_rank(tsv, query) AS score
      FROM chunks, plainto_tsquery('simple', $1) query
      WHERE tsv @@ query
      ORDER BY score DESC LIMIT 20
    `, [query]),
  ]);

  // 2c. Merge bằng reciprocal rank fusion (RRF)
  const merged = rrf(vectorHits, bm25Hits, k=60).slice(0, 20);

  // 2d. Hard RBAC filter (sensitivity gate — KHÔNG dựa prompt)
  const safe = merged.filter(h => canRead(session.role, h.doc));

  // 2e. Re-rank top 20 → top 5 bằng Haiku (1 round-trip, ~250-400ms)
  const ranked = await haikuRerank(query, safe, topK);
  return ranked;
}
```

### 3. Tool use loop trong route

Sonnet được giao **system prompt + danh sách doc catalog (cached)** + tool
defs. Quy tắc trong system prompt: **luôn gọi `search_knowledge` trước khi
trả lời câu hỏi nghiệp vụ** → Sonnet hầu như không bịa từ memory.

Sau khi nhận tool_result (5 chunk có nội dung + heading), Sonnet stream câu
trả lời tiếng Việt, có citation `path#heading`.

## Latency budget (P50, 1000 docs ~3000 chunks)

| Bước                                               | Thời gian (ms) | Ghi chú                              |
|----------------------------------------------------|----------------|--------------------------------------|
| Network user → Vercel edge (VN ↔ Singapore)        | 30–80          | Edge gần khách                       |
| Sonnet TTFT, system prompt **cache hit**           | 200–400        | Không cache: 800–1200                |
| `tool_use` decision (Sonnet)                       | 100–200        | Token quyết tool ngắn                |
| Voyage-3 embed query                               | 60–120         | Voyage có endpoint Singapore         |
| Qdrant vector search                               | 10–30          | 3000 chunks, HNSW                    |
| Postgres BM25 (chạy song song với vector)          | 5–20           | Index `tsvector` Vietnamese          |
| RRF merge + canRead filter                         | < 5            | Pure JS                              |
| Haiku rerank top-20 → top-5                        | 250–400        | 1 call, ngắn                         |
| Sonnet TTFT (lần 2, có context)                    | 300–500        | Lượt thứ 2 có context dài hơn        |
| **Tổng đến token đầu (TTFT)**                      | **~1000–1500** | Có streaming sau đó                  |
| Stream toàn câu trả lời (~200 token)               | +1500–2500     | Sonnet ~80 tok/s                     |
| **Tổng đến hết câu trả lời**                       | **~3000–4500** |                                      |

P95 (cold cache, query phức, retry): ~6–8s.

## Vì sao nhanh

1. **Prompt caching**. System prompt + knowledge catalog (~3–8K token) được
   cache trên Anthropic. Cache hit giảm ~80% chi phí và ~600ms TTFT của lượt
   Sonnet đầu. Catalog rebuild khi knowledge repo có commit mới (đính
   `cache_control: ephemeral`).

2. **Model routing**. Việc nặng & chậm (rerank) đẩy sang Haiku 4.5 — nhanh
   hơn Sonnet ~3x với chất lượng đủ tốt cho ranking. Sonnet chỉ làm việc
   nó giỏi nhất: tổng hợp câu trả lời tiếng Việt.

3. **Hybrid retrieval song song**. Vector và BM25 chạy `Promise.all`, không
   tuần tự. Tổng = max(vector, bm25), không phải tổng.

4. **Embed lúc ingest, không lúc query**. Bottleneck của RAG là embedding
   doc — mình đẩy lên ingest pipeline.

5. **Streaming SSE**. Người dùng thấy token đầu sau ~1.5s thay vì đợi 4s.
   Cảm giác nhanh hơn nhiều dù tổng latency tương tự.

6. **Filter ở payload, không sau truy xuất**. Qdrant filter `audience`
   ngay lúc search, không lấy 100 hit rồi lọc xuống còn 5 (lãng phí băng thông).

7. **Edge deployment**. Next.js trên Vercel edge khu vực Singapore (gần
   VN nhất). RTT VN ↔ SGP ~30–50ms.

## Vì sao có lúc chậm

| Triệu chứng                  | Nguyên nhân                             | Cách giảm                            |
|------------------------------|------------------------------------------|--------------------------------------|
| Lần đầu trong ngày chậm 2x   | Cache miss (cache TTL 5p)                | "Warmup" job hit cache mỗi 4 phút    |
| Câu hỏi nhiều ý → 2-3 tool call | Tool loop tuần tự                     | Khuyến khích Sonnet gọi parallel tool|
| History dài (>50 msg)        | Prompt input tăng                        | Truncate giữ 10 lượt cuối + summary  |
| Doc rất lớn (>10K token)     | Chunk overlap nhiều                      | Cắt theo H2 thay vì H1, max 800 token|
| Voyage rate limit            | Burst > 100 req/s                        | Token bucket, fallback `bge-m3` self-host |

## Khi không cần tool (tốc độ tối đa ~600ms TTFT)

Có loại câu hỏi **không cần search** — Sonnet trả thẳng từ system prompt:
- "Bạn là ai?" → trả về vai trò trợ lý
- "Tôi có những tool nào?" → liệt kê
- "Hôm nay thứ mấy?" → trả từ block context động

Sonnet được dạy: chỉ gọi tool khi cần dữ kiện nghiệp vụ. Câu xã giao bỏ qua tool.

## Đánh giá chất lượng (gold eval — Phase 1)

20 câu vàng + đáp án mong đợi + citation đúng. Job nightly chạy, đo:
- **Recall@5**: doc đúng có nằm trong top 5 không?
- **Citation precision**: citation trả về có đúng heading không?
- **Hallucination rate**: trả lời sai sự thật trong knowledge?
- **Latency P50/P95**.

Mục tiêu Phase 1:
- Recall@5: ≥ 95%
- Citation precision: ≥ 90%
- Hallucination: < 2%
- P50 TTFT: < 1.5s
- P50 full answer: < 4s

## Demo chạy ngay

Xem [`scripts/demo-retrieval.py`](../scripts/demo-retrieval.py) — BM25 thuần
stdlib trên 11 seed doc thật, có RBAC. Chạy được không cần Qdrant/Voyage.

```bash
python3 scripts/demo-retrieval.py "Làm sao xin nghỉ phép?"
python3 scripts/demo-retrieval.py "Công ty giữ bao nhiêu phần trăm?" --role employee
python3 scripts/demo-retrieval.py "Công ty giữ bao nhiêu phần trăm?" --role admin
```
