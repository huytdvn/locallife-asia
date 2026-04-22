# Local Life Asia

OTA du lịch trải nghiệm địa phương tại Đông Nam Á, trụ sở Đà Nẵng.

Repo gồm **website công khai** và **hệ thống nội bộ AI-native**.

## Cấu trúc

```
├── index.html                  # Landing page (v1.0 launch 05/04/2026)
├── apps/
│   ├── web/                    # Next.js chat AI nội bộ + admin
│   └── ingest/                 # Python pipeline raw → markdown
├── knowledge/                  # Source of truth nội dung nghiệp vụ
├── infra/                      # docker-compose cho dev services
└── packages/                   # Shared types (sẽ thêm ở Phase 1+)
```

## Triết lý

- **Markdown là source of truth.** Mọi tri thức công ty ở `knowledge/*.md`
  với YAML front-matter. DB chỉ là cache.
- **Citation-or-reject.** AI nội bộ chỉ trả lời những gì có trong knowledge
  base, luôn kèm nguồn.
- **RBAC ở tầng tool, không ở prompt.**
- **Human-in-the-loop.** Mọi thay đổi knowledge đi qua PR (AI soạn, người duyệt).

Chi tiết triết lý và lộ trình: xem [`CLAUDE.md`](./CLAUDE.md).

## Bắt đầu

```bash
# Lần đầu
cp .env.example .env.local
pnpm install
docker compose -f infra/docker-compose.yml up -d

# Chat app
pnpm dev

# Ingest (Python)
cd apps/ingest
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
```

## Lộ trình

| Phase | Tuần | Deliverable |
|-------|------|-------------|
| 0 ✅  | 1    | Foundation: scaffolding + taxonomy + 10 seed docs |
| 1     | 2-3  | Chat MVP: streaming, SSO, hybrid retrieval        |
| 2     | 3-5  | Ingestion: PDF/Drive/OCR → markdown              |
| 3     | 5-6  | Governance: RBAC, audit, write tools              |
| 4     | 6-8  | Chất lượng: re-rank, analytics, review bot        |

## Repo liên quan

- `locallife-knowledge` (private, sẽ tạo ở Phase 1): markdown production,
  submodule vào `knowledge/`. Hiện tại `knowledge/` nằm trong repo chính
  để dev dễ — Phase 1 sẽ tách.
