#!/usr/bin/env bash
# One-command deploy bootstrap for a fresh machine.
#
# Assumes:
#   - You're inside a clean git clone of this repo.
#   - .env.local is filled (at minimum: GEMINI_API_KEY, NEXTAUTH_SECRET,
#     INGEST_API_TOKEN, RAW_DIR, RCLONE_REMOTE).
#   - Prerequisites installed (Node 22, pnpm 10, Python 3.11, Docker, rclone).
#     See docs/local-setup.md §1.
#   - rclone remote configured (see docs/raw-storage.md).
#
# What it does, in order:
#   1. Pull raw files from cloud → $RAW_DIR
#   2. Verify integrity (rclone hash check)
#   3. pnpm install
#   4. docker compose up -d (postgres + qdrant + redis)
#   5. Apply DB schema (idempotent)
#   6. Python venv + pip install for ingest
#   7. Print next steps for starting servers
#
# Re-runnable: every step is idempotent. Safe to run on update too.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a; . ./.env.local; set +a
else
  echo "ERROR: .env.local not found. Copy .env.example and fill it first."
  exit 1
fi

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

step "1/6 Pull raw files from cloud (rclone)"
./scripts/raw-sync.sh pull

step "2/6 Verify raw files integrity"
./scripts/raw-sync.sh verify || {
  echo "WARNING: rclone check reported diffs. Inspect output and re-run pull if needed."
}

step "3/6 Install Node deps (pnpm)"
pnpm install --frozen-lockfile

step "4/6 Bring up infra services (Postgres / Qdrant / Redis)"
docker compose -f infra/docker-compose.yml up -d
echo "Waiting for postgres to accept connections..."
for i in $(seq 1 30); do
  if docker exec locallife-postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "postgres ready"; break
  fi
  sleep 1
done

step "5/6 Apply DB schema (idempotent)"
docker exec -i locallife-postgres psql -U postgres -d locallife \
  < apps/web/db/schema.sql

step "6/6 Python venv + ingest deps"
if [[ ! -d apps/ingest/.venv ]]; then
  python3.11 -m venv apps/ingest/.venv
fi
# shellcheck disable=SC1091
. apps/ingest/.venv/bin/activate
pip install --quiet --upgrade pip
pip install --quiet -e "apps/ingest[dev]"
deactivate

cat <<'EOF'

==============================================================
  Bootstrap complete. To start the app:

    # Terminal 1 — web (port 3000)
    pnpm --filter web dev

    # Terminal 2 — ingest API (port 8001)
    cd apps/ingest && source .venv/bin/activate
    uvicorn app.main:app --reload --port 8001

    # Terminal 3 — ingest worker
    cd apps/ingest && source .venv/bin/activate
    python -m app.worker

  Smoke test:
    BASE=http://localhost:3000 ./scripts/e2e-smoke.sh
==============================================================
EOF
