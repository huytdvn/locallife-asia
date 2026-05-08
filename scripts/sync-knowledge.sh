#!/usr/bin/env bash
# Sync tier 1 (GitHub) → tier 2 (local server) cho knowledge base.
# Chạy cron 5 phút; cũng gọi từ webhook /webhook/knowledge-merged sau khi
# verify HMAC.
#
# Env cần thiết:
#   KNOWLEDGE_DIR          — nơi chatbot đọc (mặc định /var/locallife/kb)
#   KNOWLEDGE_REPO_OWNER   — GitHub owner
#   KNOWLEDGE_REPO_NAME    — GitHub repo name (tách ở Phase 1, trước mắt là repo hiện tại)
#   KNOWLEDGE_REPO_BRANCH  — main
#   GITHUB_TOKEN           — optional, chỉ cần nếu repo private
#
# Không dùng shell interactive — idempotent, an toàn để chạy trong cron.
set -euo pipefail

KB_DIR="${KNOWLEDGE_DIR:-/var/locallife/kb}"
OWNER="${KNOWLEDGE_REPO_OWNER:-huytdvn}"
REPO="${KNOWLEDGE_REPO_NAME:-huytdvn}"
BRANCH="${KNOWLEDGE_REPO_BRANCH:-claude/ai-company-chat-system-Tz712}"

auth_prefix=""
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  auth_prefix="x-access-token:${GITHUB_TOKEN}@"
fi
REMOTE_URL="https://${auth_prefix}github.com/${OWNER}/${REPO}.git"

log() { printf '[sync-knowledge] %s\n' "$*" >&2; }

# Optional sparse-checkout: only materialise this subdir of the repo into
# the work tree. Saves disk + makes the KB subdir the only thing readers
# see when they walk the volume root. Empty/unset = full repo (legacy).
SPARSE_PATH="${KNOWLEDGE_REPO_SUBDIR:-knowledge}"

apply_sparse_checkout() {
  if [[ -z "$SPARSE_PATH" ]]; then return 0; fi
  git config core.sparseCheckout true
  printf '/%s/\n' "$SPARSE_PATH" > .git/info/sparse-checkout
}

if [[ ! -d "$KB_DIR/.git" ]]; then
  log "init: $OWNER/$REPO@$BRANCH -> $KB_DIR (sparse=${SPARSE_PATH:-<full>})"
  mkdir -p "$KB_DIR"
  if [[ -n "$(ls -A "$KB_DIR" 2>/dev/null)" ]]; then
    # Dir was seeded by docker cp / volume init but never `git clone`. Plain
    # `git clone` refuses non-empty target, so bootstrap as a repo in place.
    log "init: $KB_DIR has files but no .git — bootstrapping in place"
    cd "$KB_DIR"
    git init -q -b "$BRANCH"
    git remote add origin "$REMOTE_URL"
    apply_sparse_checkout
    git fetch --depth 50 origin "$BRANCH"
    git reset --hard "origin/${BRANCH}"
    # Drop legacy non-sparse files that were docker-cp'd at the volume root.
    if [[ -n "$SPARSE_PATH" ]]; then
      git clean -fd >/dev/null 2>&1 || true
    fi
    touch "$KB_DIR"
    exit 0
  fi
  if [[ -n "$SPARSE_PATH" ]]; then
    git clone --no-checkout --branch "$BRANCH" --depth 50 "$REMOTE_URL" "$KB_DIR"
    cd "$KB_DIR"
    apply_sparse_checkout
    git checkout "$BRANCH"
  else
    git clone --branch "$BRANCH" --depth 50 "$REMOTE_URL" "$KB_DIR"
  fi
  touch "$KB_DIR"
  exit 0
fi

cd "$KB_DIR"

# Chỉ fetch branch cần. Không pull thẳng để tránh conflict nếu ai đó
# edit tay trên server (lỗi người dùng — sync log nhưng không ghi đè).
git fetch --depth 50 origin "$BRANCH" || {
  log "ERROR: git fetch failed"
  exit 1
}

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse "origin/${BRANCH}")"

if [[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]]; then
  log "up-to-date ($LOCAL_HEAD)"
  exit 0
fi

# Kiểm tra có dirty changes không — nếu có, báo động nhưng không ghi đè.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "WARNING: local changes in $KB_DIR — aborting sync (nhân viên đã sửa tay?)"
  exit 2
fi

log "fast-forward $LOCAL_HEAD -> $REMOTE_HEAD"
git reset --hard "origin/${BRANCH}"

# Touch marker file để retrieval loader invalidate cache mtime.
touch "$KB_DIR"
log "done"
