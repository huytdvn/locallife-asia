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
| AI provider                 | Google — Gemini 2.5 Flash (chat+tool), 2.5 Flash Lite (rerank) |
| OCR tiếng Việt              | Gemini Vision (thay Claude Vision, Phase 2)            |
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
│   │   ├── lib/llm.ts                  Gemini 2.5 Flash client
│   │   ├── lib/auth.ts                 NextAuth v5 + dev X-Dev-Role
│   │   ├── lib/prompt.ts               system instruction + dynamic catalog
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

## 5. Phase 2 — Ingestion ✅ (code done, cần env để deploy)

- Parsers (`apps/ingest/app/pipeline/parsers/`): **PDF** (pdfplumber), **DOCX** (python-docx), **XLSX** (openpyxl), **Image** (Gemini Vision OCR), **MD/TXT**.
- Pipeline: `parse_file → normalize → suggest_metadata (Gemini JSON) → new_draft FM → to_markdown → commit_via_pr (GitHub API draft)`.
- Sources: `POST /upload` → dual-write local `$RAW_DIR` + Google Drive → enqueue job. `POST /drive/sync` → service-account poll + cursor Redis.
- RQ worker (`app.worker`) + Redis.
- Endpoints full: `/upload`, `/jobs/{id}`, `/drive/sync`, `/health`, Bearer token auth.
- Settings đầy đủ qua `app/config.py` — tất cả env trong `.env.local`.

## 6. Phase 3 — Governance ✅ (code done)

- `draft_update` / `commit_update` (apps/web/lib/tools): gọi GitHub API thật qua `apps/web/lib/github.ts` — tạo branch, put file, open PR draft; admin commit thẳng.
- Postgres schema `apps/web/db/schema.sql`: `roles`, `audit_log`, `unmatched_queries`.
- `apps/web/lib/audit.ts` ghi audit mọi chat/draft/commit/upload; no-op khi DB tắt.
- Webhook `apps/web/app/api/webhook/knowledge-merged/route.ts` — HMAC SHA-256 verify → trigger `sync-knowledge.sh` + `sync-to-r2.py --apply`.
- Admin UI: `/admin` (gate role lead/admin) + upload form (`components/admin-upload.tsx`) proxy qua `/api/admin/upload`.

## 7. Phase 4 — Chất lượng ✅ (code done)

- `apps/web/lib/rerank.ts`: Gemini 2.5 Flash Lite rerank top-K sau BM25; RERANK_OFF=1 để tắt (eval không cần LLM).
- `scripts/review-bot.py`: flag doc `last_reviewed > threshold_days`, tạo GitHub Issue (dry-run mặc định, `--apply` để thực).
- Analytics: `unmatched_queries` ghi query không có citation match.

## 8. Deploy & test harness ✅

- Dockerfile cho `apps/web` (Next.js standalone) + `apps/ingest` (Python 3.11).
- `infra/docker-compose.prod.yml`: web + ingest + worker + postgres (auto-apply schema) + qdrant + redis.
- CI: `.github/workflows/{ci,nightly-eval,nightly-review-bot}.yml`.
- Unit tests: `pnpm --filter web test` (6 pass) + `apps/ingest/tests/` pytest.
- E2E smoke: `BASE=... scripts/e2e-smoke.sh`.
- Deploy runbook đầy đủ: [`docs/deploy.md`](docs/deploy.md).

## 9. Câu hỏi mở (chưa quyết)

- Voyage-3 managed vs `bge-m3` self-host? Đo latency + cost trên 1000 doc thật rồi quyết.
- `knowledge/` ở Phase 1: submodule riêng hay giữ cùng repo? Đang giữ cùng để dev dễ; tách khi có nhân viên không dev xem knowledge.
- Mobile? PWA ở Phase 5+, native sau.

## 10. TODO tồn đọng (Phase 5+)

- Email ingest (`inbox@knowledge.locallife.asia`) + SES/Postmark integration.
- Mobile PWA.
- Qdrant hybrid retrieval: bật khi scale > 5k chunks (scripts đã sẵn).
- Analytics dashboard (/admin/analytics) cho unmatched queries.
- Drafts review UI (/admin/drafts) list PRs filter by label.

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

## 11. Trạng thái branch & merge

PR #2 (https://github.com/huytdvn/locallife-asia/pull/2) gộp Phase 1+2+3+4+deploy. Sau khi review + điền env + smoke-test, merge vào `main`. Không cần chia nhỏ — các wave đã được commit riêng, dễ review.

---

*Cập nhật lần cuối: 2026-04-22, bao gồm Phase 1-4 + deploy + test harness.*
