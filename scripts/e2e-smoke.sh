#!/usr/bin/env bash
# E2E smoke test — kiểm tra deploy sau khi lên stack prod/dev.
# Chạy với BASE=URL, vd:
#   BASE=http://localhost:3000 ./scripts/e2e-smoke.sh
#   BASE=https://chat.locallife.asia ./scripts/e2e-smoke.sh
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
INGEST="${INGEST:-http://localhost:8001}"

fail=0
pass=0

check() {
  local name="$1" cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  PASS  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL  $name"
    fail=$((fail + 1))
  fi
}

echo "=== e2e-smoke: $BASE ==="

check "web root 200" \
  "curl -fsS $BASE/ -o /dev/null"

check "web chat 401 when unauth" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/chat -H 'Content-Type: application/json' -d '{\"messages\":[]}')\" = '401' ]"

check "web chat SSE with X-Dev-Role" \
  "curl -fsSN -X POST $BASE/api/chat -H 'Content-Type: application/json' -H 'X-Dev-Role: employee' -d '{\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]}' -o /dev/null"

check "webhook 401 on bad signature" \
  "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/webhook/knowledge-merged -H 'X-Hub-Signature-256: sha256=bad' -d '{}')\" = '401' ]"

check "ingest health" \
  "curl -fsS $INGEST/health -o /dev/null"

echo
echo "Result: $pass passed, $fail failed"
exit $fail
