# Local Setup — Clone & Run

Hướng dẫn dành cho **người mới** (hoặc Claude Code) khi cài project lên một máy
local mới. Mục tiêu: từ máy trắng → chat chạy được tại `http://localhost:3000`
trong < 30 phút.

> Khác với [`deploy.md`](deploy.md) (prod, có SSO/R2/reverse-proxy), file này
> chỉ tập trung dev local trên laptop / máy nội bộ.

## Three modes

| Mode | Stack | Khi nào dùng |
|---|---|---|
| **A. Web only** | Next.js + BM25 in-memory, bypass SSO bằng `X-Dev-Role` | Test chat + retrieval nhanh, không cần ingest |
| **B. Full dev** | Web + Postgres + Qdrant + Redis (docker compose) + ingest + worker | Test ingestion, upload, audit log, draft PR — **mặc định khuyến nghị** |
| **C. Prod-like** | `docker-compose.prod.yml` full stack + reverse proxy + SSO thật | Server nội bộ chạy 24/7 — xem [`deploy.md`](deploy.md) |

File này hướng dẫn **mode A và B**. Mode C → đọc `deploy.md`.

---

## 1. Prerequisites trên máy đích

Cài đầy đủ **trước khi** chạy bất kỳ lệnh setup nào.

### macOS
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node@22 pnpm python@3.11 rclone
brew install --cask docker
open -a Docker   # mở Docker Desktop, accept license
```

### Linux (Ubuntu/Debian)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs git python3.11 python3.11-venv rclone
sudo npm install -g pnpm@10
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER     # logout/login lại
```

### Windows
Khuyến nghị **WSL2 + Ubuntu** rồi làm theo hướng dẫn Linux. Script bash trong
repo (`scripts/sync-knowledge.sh`, `scripts/e2e-smoke.sh`) chỉ chạy trên *nix.

### Verify
```bash
git --version
node --version           # phải v22.x
pnpm --version           # phải 10.x
python3.11 --version
docker --version
docker compose version
```

### Cổng cần rảnh
`3000` (web), `5432` (postgres), `6333` (qdrant), `6379` (redis), `8001` (ingest).
Check: `lsof -i :3000` (macOS/Linux). Nếu bị chiếm, kill app cũ hoặc đổi port
trong compose file.

---

## 2. Keys & secrets

### Bắt buộc
| Key | Lấy ở đâu | Bắt buộc cho mode |
|---|---|---|
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey → "Create API key" | A, B, C |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` | A, B, C |
| `INGEST_API_TOKEN` | `openssl rand -hex 32` | B, C |
| `KNOWLEDGE_WEBHOOK_SECRET` | `openssl rand -hex 32` | C (bỏ qua A/B) |

### Tùy chọn (bỏ qua giai đoạn đầu)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — chỉ cần khi bật SSO thật
  (mode C). Mode A/B: dùng dev bypass `X-Dev-Role`.
- `GITHUB_TOKEN` — chỉ cần khi muốn AI dùng tool `draft_update`/`commit_update`
  để mở PR vào knowledge repo.
- `VOYAGE_API_KEY`, R2 credentials, Google service account — Phase 2+, không
  cần để chạy được.

### Sinh secrets nhanh
```bash
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "INGEST_API_TOKEN=$(openssl rand -hex 32)"
echo "KNOWLEDGE_WEBHOOK_SECRET=$(openssl rand -hex 32)"
```
Copy 3 dòng output — sẽ paste vào `.env.local` ở bước 4.

---

## 3. Clone repo

```bash
mkdir -p ~/code && cd ~/code
git clone https://github.com/huytdvn/locallife-asia.git
cd locallife-asia

# Code chat ở branch active (xem HANDOFF.md). main chỉ có landing page.
git checkout claude/ai-company-chat-system-Tz712
git branch --show-current   # confirm
```

> **Path không có dấu cách.** Một số script bash trong repo không quote path
> chuẩn. Tránh thư mục như `~/My Code/`.

---

## 4. `.env.local` mẫu tối thiểu

```bash
cp .env.example .env.local
```

Mở editor, điền vào `.env.local` các dòng sau (còn lại để trống):

```env
# --- AI ---
GEMINI_API_KEY=AIza...                               # từ bước 2
GEMINI_MODEL_CHAT=gemini-2.5-flash
GEMINI_MODEL_FAST=gemini-2.5-flash-lite

# --- Auth (dev bypass — không cần SSO thật) ---
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<paste từ bước 2>
ALLOWED_EMAIL_DOMAIN=locallife.asia
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# --- Storage (docker compose dev) ---
DATABASE_URL=postgres://postgres:postgres@localhost:5432/locallife
QDRANT_URL=http://localhost:6333
REDIS_URL=redis://localhost:6379

# --- Knowledge ---
KNOWLEDGE_DIR=./knowledge

# --- Ingest (mode B) ---
INGEST_API_URL=http://localhost:8001
INGEST_API_TOKEN=<paste từ bước 2>

# --- Webhook (để trống cho mode A/B) ---
KNOWLEDGE_WEBHOOK_SECRET=<paste từ bước 2>
```

---

## 4b. Cấu hình rclone (cho mode B / C — kéo raw files từ cloud)

Raw files (PDF/DOCX/XLSX/img — ~hundreds of MB) **không nằm trong git**.
Chúng sync giữa local và cloud qua rclone. Setup 1 lần trên mỗi máy:

```bash
rclone config        # tạo remote tên `locallife-raw`, hoặc theo $RCLONE_REMOTE trong .env.local
```

Chi tiết từng provider (Drive default, R2 alt) ở [`raw-storage.md`](raw-storage.md).

Sau khi rclone config xong, bootstrap chỉ là **1 lệnh**:

```bash
./scripts/deploy-bootstrap.sh
```

Script này tự: pull raw từ cloud, verify hash, `pnpm install`, `docker compose up`,
apply schema, setup Python venv. Idempotent — chạy lại để update an toàn.

## 5. Lệnh setup — copy paste cho Claude

Sau khi xong bước 1-4 (và 4b nếu cần raw files), mở Claude Code trong thư mục repo
(`cd ~/code/locallife-asia && claude`) rồi paste prompt dưới đây.

### Prompt mode A (web-only, nhanh nhất)
```
Setup project Local Life Asia mode A (web-only, không docker).

Tình trạng đã chuẩn bị:
- Node 22, pnpm 10 đã cài.
- Repo đã clone, đang ở branch claude/ai-company-chat-system-Tz712.
- .env.local đã điền GEMINI_API_KEY và NEXTAUTH_SECRET.

Việc cần làm:
1. Chạy `pnpm install` ở root.
2. Verify: `pnpm --filter web typecheck` + `pnpm --filter web smoke:retrieval` phải pass.
3. Khởi động `pnpm --filter web dev` ở background.
4. Smoke test bằng curl với header X-Dev-Role: employee theo ví dụ trong docs/deploy.md mục 2.
5. Báo lại URL + bất kỳ lỗi nào.

Lưu ý: máy local, không cần SSO/Postgres/Qdrant/Redis. BM25 in-memory đã đủ.
```

### Prompt mode B (full dev stack — khuyến nghị)
```
Setup project Local Life Asia mode B (full dev: web + ingest + worker + docker + raw từ cloud).

Tình trạng đã chuẩn bị:
- Node 22, pnpm 10, Python 3.11, Docker, rclone đã cài. Docker Desktop đang chạy.
- Repo đã clone, đang ở branch chuẩn.
- .env.local đã điền GEMINI_API_KEY, NEXTAUTH_SECRET, INGEST_API_TOKEN, RCLONE_REMOTE.
- rclone config đã có remote `locallife-raw` (Drive hoặc R2) — verify bằng `rclone listremotes`.
- GOOGLE_CLIENT_* để trống — dùng dev bypass X-Dev-Role.

Việc cần làm:
1. Chạy `./scripts/deploy-bootstrap.sh` — script tự handle: pull raw, verify, pnpm install, docker compose up, schema, ingest venv.
2. Verify: `pnpm --filter web typecheck` + `pnpm --filter web smoke:retrieval` + `pnpm --filter web eval` (eval phải ≥ recall 95%, precision 90%).
3. Khởi động 3 process song song ở background:
   - `pnpm --filter web dev` (web, port 3000)
   - `cd apps/ingest && source .venv/bin/activate && uvicorn app.main:app --reload --port 8001`
   - `cd apps/ingest && source .venv/bin/activate && python -m app.worker`
4. Smoke test:
   - curl http://localhost:3000/  → 200
   - curl http://localhost:8001/health  → {"status":"ok"}
   - `BASE=http://localhost:3000 ./scripts/e2e-smoke.sh`
5. Báo lại URL + bất kỳ lỗi nào gặp phải.

Lưu ý: máy local, không cần reverse proxy, không cần SSO thật.
```

---

## 6. Checklist trước khi chạy lệnh setup

- [ ] Tools (`git node pnpm python3.11 docker`) đều `--version` được
- [ ] Docker Desktop đang chạy (mode B)
- [ ] Repo đã clone, đúng branch (`git branch --show-current`)
- [ ] `.env.local` có `GEMINI_API_KEY` thật (không phải placeholder)
- [ ] Các cổng 3000/5432/6333/6379/8001 không bị app khác chiếm

Khi tất cả ✅ → paste prompt mục 5 vào Claude.

---

## 7. Troubleshoot nhanh

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `pnpm: command not found` | chưa cài pnpm | `npm install -g pnpm@10` |
| `EADDRINUSE :3000` | port bị chiếm | `lsof -i :3000` rồi kill, hoặc đổi port: `PORT=3001 pnpm --filter web dev` |
| `connection refused localhost:5432` | postgres container chưa up | `docker compose -f infra/docker-compose.yml ps`; `docker compose ... logs postgres` |
| `psql: command not found` | host không có psql client | `docker exec -i locallife-postgres psql -U postgres -d locallife < apps/web/db/schema.sql` |
| `GEMINI_API_KEY` lỗi 401/403 | key sai hoặc chưa enable | regenerate ở aistudio.google.com/apikey |
| Chat trả 401 | thiếu SSO cookie | thêm header `-H "X-Dev-Role: employee"` |
| Python venv lỗi `pdfplumber` | thiếu build tools | macOS: `xcode-select --install`; Ubuntu: `sudo apt install build-essential` |
| `ENOSPC: file watchers` (Linux) | inotify limit thấp | `echo fs.inotify.max_user_watches=524288 \| sudo tee -a /etc/sysctl.conf && sudo sysctl -p` |

---

## 8. Stop / cleanup

```bash
# Dừng dev servers
# (Ctrl+C trong từng terminal, hoặc kill process bg)

# Dừng docker services
docker compose -f infra/docker-compose.yml down

# Xóa volume (mất data Postgres + Qdrant)
docker compose -f infra/docker-compose.yml down -v
```

---

## Tham khảo

- [`CLAUDE.md`](../CLAUDE.md) — triết lý hệ thống + quy ước code
- [`HANDOFF.md`](../HANDOFF.md) — trạng thái phase, branch active, quyết định đã chốt
- [`docs/deploy.md`](deploy.md) — deploy prod-like (mode C)
- [`docs/storage.md`](storage.md) — kiến trúc 3-way replication
- [`docs/retrieval.md`](retrieval.md) — flow truy vấn
- [`docs/ingestion.md`](ingestion.md) — pipeline raw → markdown
