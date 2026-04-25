#!/usr/bin/env bash
# Batch upload tất cả file được support từ 1 thư mục nguồn → ingest API.
#
# Usage:
#   ./scripts/batch-ingest.sh /path/to/source "owner@email.com"
#
# Yêu cầu: apps/ingest đang chạy + INGEST_API_TOKEN trong $INGEST_API_TOKEN
# hoặc tự grep từ .env.local.

set -u

SRC="${1:?missing source dir}"
OWNER="${2:-ops@locallife.asia}"
ENDPOINT="${INGEST_URL:-http://localhost:8001}"

if [[ -z "${INGEST_API_TOKEN:-}" ]]; then
  INGEST_API_TOKEN=$(/usr/bin/grep -E '^INGEST_API_TOKEN=' "$(dirname "$0")/../.env.local" 2>/dev/null | /usr/bin/cut -d= -f2 | /usr/bin/tr -d '[:space:]')
fi

if [[ -z "${INGEST_API_TOKEN}" ]]; then
  echo "ERROR: INGEST_API_TOKEN missing" >&2
  exit 2
fi

/usr/bin/curl -sS "${ENDPOINT}/health" >/dev/null || {
  echo "ERROR: ingest not reachable at ${ENDPOINT}" >&2
  exit 2
}

ok=0
fail=0
skip=0

while IFS= read -r -d '' f; do
  ext="${f##*.}"
  ext_lower=$(echo "$ext" | /usr/bin/tr '[:upper:]' '[:lower:]')
  case "$ext_lower" in
    pdf|docx|xlsx|csv|md|txt|png|jpg|jpeg|webp|tif|tiff) ;;
    *) skip=$((skip+1)); continue ;;
  esac

  basename=$(/usr/bin/basename "$f")
  printf '[%3d] %s ... ' "$((ok+fail+1))" "${basename:0:60}"

  resp=$(/usr/bin/curl -sS -X POST "${ENDPOINT}/upload" \
    -H "Authorization: Bearer ${INGEST_API_TOKEN}" \
    -F "file=@${f}" \
    -F "owner=${OWNER}" \
    -F 'suggested_audience=["employee","lead"]' \
    -F 'suggested_sensitivity=internal' \
    -F 'tags=[]' \
    -w '\n__HTTP__%{http_code}' 2>&1)

  http=$(echo "$resp" | /usr/bin/grep -o '__HTTP__[0-9]*' | /usr/bin/sed 's/__HTTP__//')
  body=$(echo "$resp" | /usr/bin/sed 's/__HTTP__[0-9]*$//')

  if [[ "$http" == "200" ]]; then
    job_id=$(echo "$body" | /opt/homebrew/bin/python3.11 -c "import sys,json; print(json.load(sys.stdin).get('job_id','?'))" 2>/dev/null || echo "?")
    echo "OK  (${job_id:0:8})"
    ok=$((ok+1))
  else
    echo "FAIL HTTP ${http}"
    echo "     ${body:0:200}" >&2
    fail=$((fail+1))
  fi
done < <(/usr/bin/find "$SRC" -type f \
  ! -name '.DS_Store' ! -name '._*' -print0 2>/dev/null)

echo
echo "=== Upload summary ==="
echo "  uploaded:          ${ok}"
echo "  failed:            ${fail}"
echo "  skipped (ext n/a): ${skip}"
