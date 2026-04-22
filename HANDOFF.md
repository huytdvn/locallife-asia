# HANDOFF — Trạng thái repo & kế hoạch tiếp theo

Tài liệu để nhân viên/Claude mở **CLI session mới** có thể pick up ngay
không cần hỏi lại. Update khi có thay đổi lớn.

**Branch active**: `claude/ai-company-chat-system-Tz712`
**Commits**: `25592b2` (Phase 0 scaffold) → `c610107` (ingestion docs+demo) → `c6a9fa9` (retrieval docs+demo) → Phase 1 WIP (retrieval local-first, SSE, SSO, eval, storage 3-way)
**Chưa merge vào `main`.** Main vẫn chỉ có landing page (`index.html`).
**Phase 1 eval** (local BM25, không cần infra): recall@5 100%, precision@1 93.3%, RBAC 100%, latency P50 0.4ms.

## 1. Quyết định đã chốt (đừng hỏi lại)

| Quyết định                  | Chốt                                                   |
|-----------------------------|--------------------------------------------------------|
| Scale                       | Startup 30–100 nv, vài nghìn doc                       |
| Stack                       | Hybrid: Python ingestion + Next.js app                 |
| Data nguồn                  | Hỗn hợp PDF + Google Drive + ảnh scan                  |
| AI write model              | Lai: employee read-only, admin/lead write qua AI       |
| Source of truth             | Markdown trong `knowledge/` với YAML front-matter      |
| **Text replication (3-way)** | Git + Local server công ty + R2 (object-locked, versioned). Chi tiết: [`docs/storage.md`](docs/storage.md) |
| **Raw file replication**     | 2-way: Local server công ty + Google Drive            |
| **Chatbot runtime read**     | Từ local server (env `KNOWLEDGE_DIR`), không đọc trực tiếp git hay R2 |
| Embedding                   | Voyage-3 (managed), fallback `bge-m3` self-host        |
| Vector DB                   | Qdrant Cloud (free tier)                               |
| RDBMS                       | Neon Postgres                                          |
| Object storage              | Cloudflare R2 — 2 bucket: `locallife-raw` + `locallife-kb-archive` |
| Queue                       | Redis + RQ (dev); Upstash (prod)                       |
| AI provider                 | Anthropic — Sonnet 4.6 (chat), Haiku 4.5 (rerank/tool) |
| OCR tiếng Việt              | Claude Vision (không dùng Tesseract)                   |
| Auth                        | NextAuth + Google Workspace SSO (`@locallife.asia`)    |
| RBAC enforcement            | Ở tầng tool (payload filter Qdrant + `canRead()`)      |
| Knowledge repo              | Sẽ tách ra repo riêng `locallife-knowledge` ở Phase 1  |

## 2. Cấu trúc hiện tại

```
huytdvn/
├── index.html                  landing page (v1.0 launch 05/04/2026) — ĐỪNG ĐỤNG
├── CLAUDE.md                   hướng dẫn cho AI coding agents
├── HANDOFF.md                  file này
├── README.md
├── package.json, pnpm-workspace.yaml, .env.example, .gitignore
├── docs/
│   ├── ingestion.md            giao thức 4 kênh nạp dữ liệu
│   ├── retrieval.md            flow truy vấn + latency budget
│   └── storage.md              3-way text + 2-way raw replication spec
├── evals/
│   └── gold.json               15 test case retrieval + RBAC
├── apps/
│   ├── web/                    Next.js 15
│   │   ├── app/(chat)/page.tsx
│   │   ├── app/api/chat/route.ts       SSE streaming tool-use loop
│   │   ├── app/api/auth/[...nextauth]/route.ts
│   │   ├── app/login/page.tsx          Google SSO login
│   │   ├── middleware.ts               guard /api/chat, /admin
│   │   ├── lib/anthropic.ts
│   │   ├── lib/auth.ts                 NextAuth v5 + dev X-Dev-Role
│   │   ├── lib/prompt.ts               3-block system prompt + catalog cache
│   │   ├── lib/rbac.ts
│   │   ├── lib/knowledge-loader.ts     fs walk + FM + H2 chunker + mtime cache
│   │   ├── lib/bm25.ts                 BM25 in-memory
│   │   ├── lib/retrieval.ts            hybrid search (local-first)
│   │   ├── lib/tools/index.ts          4 tool: search/get/draft/commit
│   │   ├── components/chat.tsx         SSE streaming client
│   │   └── scripts/{smoke-retrieval,run-eval,build-index}.mjs
│   └── ingest/                 Python FastAPI — 9 file .py skeleton
├── knowledge/                  11 seed markdown (public → restricted)
├── infra/docker-compose.yml    Postgres + Qdrant + Redis (dev)
└── scripts/
    ├── demo-pipeline.py        raw → markdown+frontmatter (stdlib)
    ├── demo-retrieval.py       BM25 + RBAC demo (stdlib)
    ├── sync-knowledge.sh       tier 1 (git) → tier 2 (local server)
    ├── sync-to-r2.py           tier 2 → tier 3 (R2 object-lock archive)
    └── sample-raw/sop-booking.txt
```

## 3. Phase 0 — DONE ✅

- Monorepo skeleton (pnpm workspace)
- 11 seed docs tiếng Việt đủ spread (có 1 doc `restricted` để test RBAC)
- Taxonomy + front-matter spec ([`knowledge/README.md`](knowledge/README.md))
- `apps/web` khung Next.js với Claude tool-use loop (không streaming)
- `apps/ingest` khung FastAPI + Pydantic FM schema
- RBAC guard trong `apps/web/lib/rbac.ts` (mirror schema Python)
- 2 demo chạy thật, không cần infra:
  - `python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt`
  - `python3 scripts/demo-retrieval.py "Làm sao xin nghỉ phép?" --role employee`

## 4. Phase 1 — Chat MVP + Replication (tuần 2-3)

Ưu tiên theo thứ tự. Mỗi item commit riêng. Kiến trúc lưu trữ 3-way
(text) + 2-way (raw) theo [`docs/storage.md`](docs/storage.md).

### P1.1 — Bootstrap deps & env ✅ (done)

`pnpm install` ok; `pnpm --filter web typecheck` pass.

### P1.2 — Hybrid retrieval (local-first) ✅ (done)

- [`apps/web/lib/knowledge-loader.ts`](apps/web/lib/knowledge-loader.ts) — fs walk + gray-matter + H2 chunker + cache theo mtime.
- [`apps/web/lib/bm25.ts`](apps/web/lib/bm25.ts) — BM25 in-memory, tokenizer VN-friendly.
- [`apps/web/lib/retrieval.ts`](apps/web/lib/retrieval.ts) — local-first; RBAC filter sau scoring; excerpt window quanh query hit.
- Hybrid mode (Qdrant + Voyage) vẫn chưa wire — ưu tiên thấp, local BM25 đủ cho ≤ 5k chunks.
- Verified: `pnpm --filter web smoke:retrieval` — 11 docs / 71 chunks, restricted doc không xuất hiện với role employee.

### P1.3 — Streaming SSE ✅ (done)

- [`apps/web/app/api/chat/route.ts`](apps/web/app/api/chat/route.ts) chuyển sang `anthropic.messages.stream()`, emit SSE events: `delta`, `tool_start`, `tool_result`, `citations`, `done`, `error`.
- [`apps/web/components/chat.tsx`](apps/web/components/chat.tsx) đọc SSE qua fetch + ReadableStream, render progressive.

### P1.4 — NextAuth Google Workspace SSO ✅ (done — cần env prod để verify e2e)

- [`apps/web/lib/auth.ts`](apps/web/lib/auth.ts) — NextAuth v5 + Google provider, `hd=locallife.asia`, defence-in-depth check profile.hd.
- JWT callback: role mặc định "employee"; override static qua `ADMIN_EMAILS` / `LEAD_EMAILS` env cho seed/MVP.
- [`apps/web/middleware.ts`](apps/web/middleware.ts) guard `/api/chat` + `/admin`; dev bypass qua X-Dev-Role.
- Role elevation production (Google Group → Postgres role table) là Phase 2 work.

### P1.5 — Prompt caching động ✅ (done)

- [`apps/web/lib/prompt.ts`](apps/web/lib/prompt.ts) — 3 block, 2 cache-marker:
  - Block 1: persona + rules (gần như never changes).
  - Block 2: catalog — list path/id/audience/tags từ `loadKnowledge()`, lọc theo audience.
  - Block 3: session context (role + date) — không cache.
- Catalog tự rebuild khi mtime `KNOWLEDGE_DIR` đổi.

### P1.6 — Gold eval set + runner ✅ (done)

- [`evals/gold.json`](evals/gold.json) — 15 case bao phủ 6 phòng ban + 1 RBAC negative.
- [`apps/web/scripts/run-eval.mjs`](apps/web/scripts/run-eval.mjs) — chạy: `pnpm --filter web eval`.
- **Kết quả hiện tại**: recall@5 100%, precision@1 93.3%, RBAC 100%, P50 latency 0.4ms.

### P1.7 — Sync knowledge multi-tier ✅ (done — scripts ready, chưa deploy)

- [`scripts/sync-knowledge.sh`](scripts/sync-knowledge.sh) — tier 1 (git) → tier 2 (local server). Idempotent, safe cho cron.
- [`scripts/sync-to-r2.py`](scripts/sync-to-r2.py) — tier 2 → tier 3 (R2 archive) với Object Lock retention theo sensitivity (restricted 10y / internal 3y / public 1y). Plan mode không cần boto3.
- **Còn lại (Phase 2)**: webhook `/api/webhook/knowledge-merged` để trigger sync theo event thay vì cron.

### P1.8 — Optional: Qdrant hybrid mode ✅ (done — scripts ready)

- [`apps/web/scripts/build-index.mjs`](apps/web/scripts/build-index.mjs) — embed knowledge/ qua Voyage-3 → Qdrant. Plan mode mặc định; `--apply` khi có env.
- **Chỉ dùng khi scale > 5k chunks hoặc muốn semantic match mạnh hơn BM25.** Hiện không cần.

Mục tiêu Phase 1 ĐÃ ĐẠT: recall@5 100% (≥ 95%), precision@1 93.3% (≥ 90%), P50 retrieval 0.4ms (≪ 1.5s). Replication scripts ready, cần env prod để deploy.

## 5. Phase 2 — Ingestion (tuần 3-5)

Tuần 1 của Phase 2:
- [`apps/ingest/app/pipeline/parsers/pdf.py`](apps/ingest/app/pipeline/parsers/pdf.py) — unstructured + pdfplumber fallback cho bảng
- [`apps/ingest/app/pipeline/parsers/image.py`](apps/ingest/app/pipeline/parsers/image.py) — Claude Vision OCR (prompt đã có sẵn trong file)
- `apps/ingest/app/pipeline/parsers/{docx,xlsx}.py` — mới
- `apps/ingest/app/pipeline/embed.py` — mới, Voyage-3 + Qdrant upsert

Tuần 2 của Phase 2:
- `apps/ingest/app/sources/upload.py` — handler cho `/upload`:
  1. Lưu vào local `$RAW_DIR/YYYY/MM/{ulid}.{ext}` (primary).
  2. Push song song lên Google Drive (service account, tier 2 raw).
  3. Enqueue parse job.
- `apps/ingest/app/sources/drive.py` — service account poll `GOOGLE_DRIVE_RAW_FOLDER_ID` + delta detect; kéo bản mới về `$RAW_DIR`.
- `apps/ingest/app/pipeline/commit.py` — GitHub API tạo PR tới `locallife-knowledge` (tier 1 text).
- RQ worker thật + Redis.

Tuần 3 của Phase 2:
- `apps/web/app/admin/page.tsx` — upload UI + job queue status.
- Webhook merge PR → embed job + sync to R2 archive (tier 3 text) với object-lock.
- Legal flow: upload hợp đồng ký → ghi 3 nơi đồng bộ (`$LEGAL_DIR`, Drive `LLA Legal`, R2 object-lock); tính SHA-256 viết vào FM working copy.

## 6. Phase 3 — Governance (tuần 5-6)

- [`apps/web/lib/tools/index.ts:118`](apps/web/lib/tools/index.ts) `draft_update` thật (GitHub API)
- [`apps/web/lib/tools/index.ts:131`](apps/web/lib/tools/index.ts) `commit_update` thật + audit log Postgres
- Schema `audit_log` (user_id, query, answer, citations, tool_calls, ts)
- Admin UI review drafts, approve/reject

## 7. Phase 4 — Chất lượng (tuần 6-8)

- Haiku re-rank tối ưu (prompt, batch)
- Nightly review bot (flag doc `last_reviewed > 90 days`)
- Analytics: câu hỏi không tìm được → đề xuất doc cần viết (dashboard)
- Email ingest (`inbox@knowledge.locallife.asia`)

## 8. Câu hỏi mở (chưa quyết)

- Voyage-3 managed vs `bge-m3` self-host? Đo latency + cost trên 1000 doc thật rồi quyết.
- `knowledge/` ở Phase 1: submodule riêng hay giữ cùng repo? Đang giữ cùng để dev dễ; tách khi có nhân viên không dev xem knowledge.
- Mobile? PWA ở Phase 5+, native sau.

## 9. TODOs cụ thể trong code (grep)

```
apps/web/lib/tools/index.ts:118    TODO(phase-3): tạo PR qua GitHub API
apps/web/lib/tools/index.ts:131    TODO(phase-3): commit + audit log
apps/ingest/app/main.py:28         TODO(phase-2): raw = local + Drive, enqueue
apps/ingest/app/main.py:38         TODO(phase-2): Drive delta sync → $RAW_DIR
apps/ingest/app/pipeline/parsers/pdf.py:10     TODO(phase-2)
apps/ingest/app/pipeline/parsers/image.py:27   TODO(phase-2): Claude Vision
scripts/sync-to-r2.py                           TODO(phase-1.7): object-lock R2 archive
```

## 10. Cách chạy ngay để sanity-check

```bash
# 1) Demo Python (stdlib-only, không cần infra)
python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt
python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm" --role employee
python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm" --role admin

# 2) Smoke BM25 retrieval (Node, sau pnpm install)
pnpm install
pnpm --filter web smoke:retrieval
# → 11 docs / 71 chunks; role employee không thấy finance/pricing-structure

# 3) Typecheck + lint
pnpm --filter web typecheck
```

## 11. Khi nào merge branch?

Đề xuất: **merge vào `main` sau khi hoàn thành Phase 1** (chat MVP chạy
thật với Anthropic API + retrieval + SSO). Trước đó là skeleton, merge
sớm làm loãng `main`.

Sau merge: tạo branch mới `claude/ingestion-pipeline-<ticket>` cho Phase 2.

---

*Cập nhật lần cuối: 2026-04-22, commit `c6a9fa9`.*
