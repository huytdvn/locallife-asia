# HANDOFF — Trạng thái repo & kế hoạch tiếp theo

Tài liệu để nhân viên/Claude mở **CLI session mới** có thể pick up ngay
không cần hỏi lại. Update khi có thay đổi lớn.

**Branch active**: `claude/ai-company-chat-system-Tz712`
**Commits**: `25592b2` (Phase 0 scaffold) → `c610107` (ingestion docs+demo) → `c6a9fa9` (retrieval docs+demo)
**Chưa merge vào `main`.** Main vẫn chỉ có landing page (`index.html`).

## 1. Quyết định đã chốt (đừng hỏi lại)

| Quyết định                  | Chốt                                                   |
|-----------------------------|--------------------------------------------------------|
| Scale                       | Startup 30–100 nv, vài nghìn doc                       |
| Stack                       | Hybrid: Python ingestion + Next.js app                 |
| Data nguồn                  | Hỗn hợp PDF + Google Drive + ảnh scan                  |
| AI write model              | Lai: employee read-only, admin/lead write qua AI       |
| Source of truth             | Markdown trong `knowledge/` với YAML front-matter      |
| Embedding                   | Voyage-3 (managed), fallback `bge-m3` self-host        |
| Vector DB                   | Qdrant Cloud (free tier)                               |
| RDBMS                       | Neon Postgres                                          |
| Object storage              | Cloudflare R2                                          |
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
│   └── retrieval.md            flow truy vấn + latency budget
├── apps/
│   ├── web/                    Next.js 15 — 15 file TS/CSS skeleton
│   │   ├── app/(chat)/page.tsx, app/api/chat/route.ts
│   │   ├── lib/{anthropic,prompt,rbac,retrieval,auth}.ts
│   │   ├── lib/tools/index.ts  4 tool: search/get/draft/commit
│   │   └── components/chat.tsx
│   └── ingest/                 Python FastAPI — 9 file .py skeleton
│       ├── app/main.py         /upload, /drive/sync, /health (stubs)
│       └── app/pipeline/{frontmatter.py, parsers/{pdf,image}.py}
├── knowledge/                  11 seed markdown (public → restricted)
│   ├── README.md               taxonomy + FM spec
│   ├── 00-company/             vision-mission, values
│   ├── 10-hr/                  onboarding 30-60-90, leave policy+form
│   ├── 20-operations/          host-onboarding, refund-policy
│   ├── 30-product/             homestay-standards
│   ├── 40-partners/            artisans, host 1-pager mẫu
│   └── 50-finance/             pricing-structure (restricted)
├── infra/docker-compose.yml    Postgres + Qdrant + Redis (dev)
└── scripts/                    demo chạy stdlib-only
    ├── demo-pipeline.py        raw → markdown+frontmatter
    ├── demo-retrieval.py       BM25 + RBAC trên seed docs
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

## 4. Phase 1 — CẦN LÀM TIẾP (tuần 2-3)

Ưu tiên theo thứ tự. Mỗi item commit riêng.

### P1.1 — Bootstrap deps & env (đầu tiên, ~30 phút)

```bash
pnpm install                                   # web deps
cd apps/ingest && python3.11 -m venv .venv \
  && source .venv/bin/activate && pip install -e ".[dev]"
cp .env.example .env.local                     # điền ANTHROPIC_API_KEY tối thiểu
docker compose -f infra/docker-compose.yml up -d
```

Verify:
- `pnpm --filter web typecheck` pass (sẽ lòi vài type issue nhẹ — fix)
- `curl localhost:8001/health` trả `{"status":"ok"}`
- Qdrant UI localhost:6333/dashboard lên

### P1.2 — Hybrid retrieval thật ([`apps/web/lib/retrieval.ts:30`](apps/web/lib/retrieval.ts))

Thay stub bằng:
- Load markdown từ `knowledge/` (Node fs), parse front-matter bằng `gray-matter`
- Chunk theo H2 (logic mượn trong `scripts/demo-retrieval.py`)
- Voyage-3 embed batch → upsert Qdrant (script 1 lần, `scripts/build-index.ts`)
- Query runtime: `Promise.all([qdrant.search, postgres bm25])` → RRF merge → `canRead` filter → Haiku rerank → top-5

Test: `POST /api/chat` với `X-Dev-Role: employee` câu "xin nghỉ phép" → trả citation đúng file HR.

### P1.3 — Streaming SSE ([`apps/web/app/api/chat/route.ts`](apps/web/app/api/chat/route.ts))

Thay `anthropic.messages.create` bằng `.stream()`. Forward chunk qua SSE.
Client `components/chat.tsx` đọc SSE (EventSource hoặc fetch stream).

### P1.4 — NextAuth Google Workspace SSO ([`apps/web/lib/auth.ts`](apps/web/lib/auth.ts))

- Provider Google, `hostedDomain: "locallife.asia"`
- JWT chứa `role` (default "employee"); map từ Google Group qua job `scripts/sync-roles.ts`
- Middleware guard `/api/chat` + `/admin`

### P1.5 — Prompt caching động

[`apps/web/lib/prompt.ts`](apps/web/lib/prompt.ts) thêm block thứ 3:
- Generate catalog (list title + id + path + audience) từ knowledge/ khi build
- Rebuild khi `knowledge/` có commit mới (cron 5 phút hoặc webhook)
- `cache_control: ephemeral`

### P1.6 — Gold eval set + runner

Tạo `evals/gold.yaml` — 20 câu + đáp án mong đợi + citation path mong đợi.
Script `scripts/run-eval.ts` gọi `/api/chat` loop qua 20 câu, đo recall@5,
citation precision, latency. Chạy nightly GitHub Actions.

Mục tiêu Phase 1: recall@5 ≥ 95%, citation precision ≥ 90%, P50 TTFT < 1.5s.

## 5. Phase 2 — Ingestion (tuần 3-5)

Tuần 1 của Phase 2:
- [`apps/ingest/app/pipeline/parsers/pdf.py`](apps/ingest/app/pipeline/parsers/pdf.py) — unstructured + pdfplumber fallback cho bảng
- [`apps/ingest/app/pipeline/parsers/image.py`](apps/ingest/app/pipeline/parsers/image.py) — Claude Vision OCR (prompt đã có sẵn trong file)
- `apps/ingest/app/pipeline/parsers/{docx,xlsx}.py` — mới
- `apps/ingest/app/pipeline/embed.py` — mới, Voyage-3 + Qdrant upsert

Tuần 2 của Phase 2:
- `apps/ingest/app/sources/upload.py` — handler cho `/upload` (R2 put + enqueue)
- `apps/ingest/app/sources/drive.py` — service account poll + delta detect
- `apps/ingest/app/pipeline/commit.py` — GitHub API tạo PR tới `locallife-knowledge`
- RQ worker thật + Redis

Tuần 3 của Phase 2:
- `apps/web/app/admin/page.tsx` — upload UI + job queue status
- Webhook `POST /webhook/knowledge-merged` → embed job khi PR merge

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
apps/web/lib/retrieval.ts:30       TODO(phase-1): hybrid retrieval
apps/web/lib/retrieval.ts:40       TODO(phase-1): đọc từ knowledge/ + canRead
apps/web/lib/tools/index.ts:118    TODO(phase-3): tạo PR qua GitHub API
apps/web/lib/tools/index.ts:131    TODO(phase-3): commit + audit log
apps/ingest/app/main.py:28         TODO(phase-2): R2 upload + enqueue
apps/ingest/app/main.py:38         TODO(phase-2): Drive delta sync
apps/ingest/app/pipeline/parsers/pdf.py:10     TODO(phase-2)
apps/ingest/app/pipeline/parsers/image.py:27   TODO(phase-2): Claude Vision
```

## 10. Cách chạy ngay để sanity-check

Không cần cài gì (stdlib Python):

```bash
# Pipeline ingestion (3 bước đầu)
python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt

# Retrieval với RBAC
python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm" --role employee
python3 scripts/demo-retrieval.py "công ty giữ bao nhiêu phần trăm" --role admin
# → employee không thấy doc finance, admin thấy đầy đủ
```

## 11. Khi nào merge branch?

Đề xuất: **merge vào `main` sau khi hoàn thành Phase 1** (chat MVP chạy
thật với Anthropic API + retrieval + SSO). Trước đó là skeleton, merge
sớm làm loãng `main`.

Sau merge: tạo branch mới `claude/ingestion-pipeline-<ticket>` cho Phase 2.

---

*Cập nhật lần cuối: 2026-04-22, commit `c6a9fa9`.*
