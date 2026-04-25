# Deployment Runbook — Local Life Asia Internal

Hai tầng deploy:

1. **Dev/local (Docker compose on laptop)** — `infra/docker-compose.yml`: chỉ Postgres + Qdrant + Redis.
2. **Prod (company server hoặc VPS)** — `infra/docker-compose.prod.yml`: full stack (web + ingest + worker + postgres + qdrant + redis).

Nguyên tắc:
- **Keys/tokens điền vào `.env.local`** ở root monorepo, compose đọc tự động.
- **Knowledge dir** mount từ host vào container (tier 2 local server read path).
- **Secrets không commit** — `.env.local` đã trong `.gitignore`.

## 1. Prerequisites

| Yêu cầu | Mục đích |
|---|---|
| Docker + Docker Compose | Chạy stack |
| `git` | Clone + sync knowledge repo |
| Key Gemini (`GEMINI_API_KEY`) | Chat + OCR + AI classify |
| Google OAuth creds | SSO nhân viên |
| Google service account JSON | Drive poll + Drive upload |
| GitHub fine-grained PAT | `draft_update` / `commit_update` |
| R2 credentials | Archive tier 3 (optional, Phase 2+) |
| Domain + TLS | Reverse proxy (Caddy, Nginx, Traefik) |

## 2. Khởi động dev local

```bash
# 1. Copy env
cp .env.example .env.local
# Điền tối thiểu GEMINI_API_KEY; còn lại optional.

# 2. Install + run
pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres + Qdrant + Redis

# 3. Apply schema + migrations + seeds (deploy-bootstrap.sh tự động làm hết).
#    Manual nếu chỉ muốn DB:
psql $DATABASE_URL -f apps/web/db/schema.sql
for m in apps/web/db/migrations/*.sql; do psql $DATABASE_URL -f "$m"; done
for s in apps/web/db/seed/*.sql;       do psql $DATABASE_URL -f "$s"; done

# 4. Web dev
pnpm --filter web dev   # http://localhost:3000

# 5. Ingest dev (nếu cần thử upload/Drive)
cd apps/ingest && python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
# Worker song song:
python -m app.worker
```

Test chat qua curl (bypass SSO):
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" -H "X-Dev-Role: employee" \
  -d '{"messages":[{"role":"user","content":"Làm sao xin nghỉ phép?"}]}'
```

## 3. Deploy prod (1 server)

### 3.1 Chuẩn bị

```bash
# Trên server prod
git clone https://github.com/huytdvn/locallife-asia.git
cd locallife-asia
cp .env.example .env.local
$EDITOR .env.local      # điền key đầy đủ
```

Điền các field bắt buộc ở `.env.local`:
```
GEMINI_API_KEY=
NEXTAUTH_URL=https://chat.locallife.asia
NEXTAUTH_SECRET=$(openssl rand -base64 32)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DATABASE_URL=postgres://postgres:postgres@postgres:5432/locallife
KNOWLEDGE_DIR=/app/knowledge
GITHUB_TOKEN=
KNOWLEDGE_WEBHOOK_SECRET=
INGEST_API_TOKEN=
```

### 3.2 Build + up stack

```bash
docker compose -f infra/docker-compose.prod.yml --env-file .env.local up -d --build
```

Verify:
```bash
curl http://localhost:3000/                           # landing
curl http://localhost:8001/health                     # {"status":"ok"}
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'
# → 401 (cần SSO) → OK
```

### 3.3 Reverse proxy (Caddy ví dụ)

```
chat.locallife.asia {
  reverse_proxy localhost:3000
}
ingest.locallife.asia {
  reverse_proxy localhost:8001
  @admin remote_ip <company-ip-range>
  handle { abort }
}
```

### 3.4 Knowledge sync tier 1 → tier 2

Cron 5 phút trên host:
```cron
*/5 * * * * /path/to/locallife-asia/scripts/sync-knowledge.sh >> /var/log/kb-sync.log 2>&1
```

Webhook từ GitHub (settings → Webhooks):
- Payload URL: `https://chat.locallife.asia/api/webhook/knowledge-merged`
- Content type: `application/json`
- Secret: giá trị `KNOWLEDGE_WEBHOOK_SECRET`
- Events: `push`

### 3.5 R2 archive tier 3 (optional)

Sau khi đã có R2 bucket với Object Lock bật:
```bash
python3 scripts/sync-to-r2.py --apply    # 1 lần để seed
```

Sau đó webhook `knowledge-merged` tự trigger mỗi lần merge.

### 3.6 Data sync dev → prod (DB rows qua git)

Knowledge và raw files đã có đường đồng bộ riêng. **DB rows** (như `roles`
table) đi qua git như sau:

```
┌─────────────────┐                                ┌─────────────────┐
│ Dev: /admin/    │                                │ Server: deploy- │
│ users thay đổi  │                                │ bootstrap.sh    │
│   role          │                                │                 │
│   ↓             │                                │ 1. git pull     │
│ pnpm db:snapshot│ → apps/web/db/seed/roles.sql → │ 2. schema.sql   │
│   ↓             │   (committed to git, in PR)    │ 3. migrations/  │
│ git commit+push │                                │ 4. seed/*.sql   │
│   ↓             │                                │   ON CONFLICT   │
│ PR review/merge │                                │   DO NOTHING    │
└─────────────────┘                                └─────────────────┘
```

**Workflow điển hình** khi admin dev thêm 1 user mới:

```bash
# 1. Add user qua UI hoặc SQL
# (UI: /admin/users → form → submit, hoặc psql INSERT)

# 2. Snapshot DB → seed file
pnpm db:snapshot                  # = ./scripts/db-export-seed.sh
# Mặc định bỏ qua *-dev@locallife.asia (synthetic NextAuth dev users)
# --include-dev nếu muốn include hết

# 3. Review file thay đổi
git diff apps/web/db/seed/roles.sql

# 4. Commit + push qua PR như code
git add apps/web/db/seed/roles.sql
git commit -m "data(roles): add new admin nguyen.van.a@locallife.asia"
git push

# 5. PR merge → server deploy → seed tự apply
#    ON CONFLICT DO NOTHING: rows đã có trên prod KHÔNG bị overwrite.
```

**Rule of thumb**: chỉ commit role changes mà bạn THỰC SỰ muốn cấp quyền
trên prod. `pnpm db:snapshot` mặc định loại bỏ user dev synthetic; rows
khác được expose nguyên si.

**Disable user trên prod sau khi đã seed**: vì seed chỉ INSERT, disable
một user qua admin UI prod sẽ ghi vào DB prod (`disabled=true`). Lần
deploy sau, INSERT bị NO-OP do conflict, row disabled vẫn giữ nguyên.

**Audit log + unmatched_queries** không sync — telemetry per-environment.
Khi cần backup, chạy `pg_dump` riêng (xem mục 7).

## 4. CI/CD

- `.github/workflows/ci.yml` — typecheck + lint + eval + build mỗi PR.
- `.github/workflows/nightly-eval.yml` — gold eval 01:30 UTC.
- `.github/workflows/nightly-review-bot.yml` — flag doc quá hạn 01:00 UTC.

Auto-deploy prod: tùy host. Ví dụ SSH deploy hook GitHub Action bắn lệnh:
```yaml
- name: Deploy
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.SERVER_HOST }}
    username: deploy
    key: ${{ secrets.SSH_KEY }}
    script: |
      cd /srv/locallife-asia
      git pull
      docker compose -f infra/docker-compose.prod.yml up -d --build
```

## 5. Smoke test sau deploy

Chạy `scripts/e2e-smoke.sh` từ máy local (ngoài server) trỏ về URL prod:
```bash
BASE=https://chat.locallife.asia ./scripts/e2e-smoke.sh
```

Kỳ vọng:
- `/api/webhook/knowledge-merged` trả 401 với signature sai.
- `/api/chat` trả 401 khi không có SSO cookie.
- Login Google SSO → redirect đúng → cookie set.
- Upload file test qua admin UI → job status đi qua `queued` → `finished` với `pr_url`.

## 6. Rollback

```bash
git reset --hard <previous-sha>
docker compose -f infra/docker-compose.prod.yml up -d --build
```

DB: không có migration nào ở Phase 1-3 đòi rollback manual. Schema thêm cột mới thì backward-compatible.

## 7. Backup + DR

- Postgres: daily `pg_dump` → R2 bucket `locallife-db-backups/YYYY-MM-DD.sql.gz`.
- Qdrant: rebuild từ markdown qua `pnpm --filter web build-index --apply` (không cần backup).
- Raw files: ZFS snapshot local + Drive copy (đã có) + R2 cold tier.
- Markdown: git (tier 1) là đủ.
