#!/usr/bin/env bash
# Raw files sync between local $RAW_DIR and a cloud remote (rclone-managed).
#
# Provider-agnostic: works with Google Drive, Cloudflare R2, AWS S3,
# Dropbox, OneDrive, Backblaze B2, etc. — whatever rclone supports.
#
# Setup once on the machine:
#   rclone config           # create a remote named after $RCLONE_REMOTE
# See docs/raw-storage.md for step-by-step (Drive default, R2 alt).
#
# Usage:
#   ./scripts/raw-sync.sh push                  # local → cloud (seed/backup)
#   ./scripts/raw-sync.sh pull                  # cloud → local (deploy)
#   ./scripts/raw-sync.sh verify                # rclone check (hash compare)
#   ./scripts/raw-sync.sh manifest              # write sha256 manifest
#
# Env (read from $REPO/.env.local automatically if present):
#   RAW_DIR          where chat ingest reads raw files. Default: ./apps/ingest/tmp/raw
#   RCLONE_REMOTE    rclone remote name. Default: locallife-raw
#   RCLONE_PATH      sub-path on the remote. Default: raw
set -euo pipefail

# Auto-load .env.local so caller doesn't have to export.
if [[ -f .env.local ]]; then
  set -a; . ./.env.local; set +a
fi

RAW_DIR="${RAW_DIR:-./apps/ingest/tmp/raw}"
REMOTE="${RCLONE_REMOTE:-locallife-raw}"
REMOTE_PATH="${RCLONE_PATH:-raw}"
TARGET="${REMOTE}:${REMOTE_PATH}"

cmd="${1:-}"
case "$cmd" in
  push|pull|verify|manifest) ;;
  *) echo "usage: $0 {push|pull|verify|manifest}" >&2; exit 2 ;;
esac

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone not installed. Install:" >&2
  echo "  macOS:  brew install rclone" >&2
  echo "  Linux:  curl https://rclone.org/install.sh | sudo bash" >&2
  exit 1
fi

# Confirm the remote exists in rclone config.
if ! rclone listremotes | grep -q "^${REMOTE}:$"; then
  echo "rclone remote '${REMOTE}:' not configured." >&2
  echo "Run 'rclone config' and follow docs/raw-storage.md." >&2
  exit 1
fi

mkdir -p "$RAW_DIR"

case "$cmd" in
  push)
    echo "[raw-sync] push $RAW_DIR/ → $TARGET/"
    rclone sync "$RAW_DIR/" "$TARGET/" \
      --progress --transfers=8 --checkers=16 \
      --checksum --fast-list --create-empty-src-dirs=false
    ;;
  pull)
    echo "[raw-sync] pull $TARGET/ → $RAW_DIR/"
    rclone sync "$TARGET/" "$RAW_DIR/" \
      --progress --transfers=8 --checkers=16 \
      --checksum --fast-list --create-empty-src-dirs=false
    ;;
  verify)
    echo "[raw-sync] check $TARGET/ vs $RAW_DIR/"
    rclone check "$TARGET/" "$RAW_DIR/" --one-way --combined -
    ;;
  manifest)
    out="${RAW_DIR%/}/.manifest-sha256.txt"
    echo "[raw-sync] write $out"
    ( cd "$RAW_DIR" && find . -type f ! -name '.manifest*' \
        -exec shasum -a 256 {} \; \
        | sed 's|^\./||' | sort > "$out" )
    wc -l "$out"
    ;;
esac
