# Phase 1 — API Contracts: Onboarding & Engagement

**Branch**: `001-employee-onboarding-engagement` | **Base path**: `/api/onboarding`

Tất cả endpoint authenticated qua existing NextAuth session. RBAC enforced ở route handler trước khi chạm DB. Schema validated qua Zod (see `apps/web/lib/onboarding/schema.ts`).

## Conventions

- Request body: `application/json` (UTF-8).
- Response shape: `{ ok: true, data: ... }` hoặc `{ ok: false, error: { code, message, details? } }`.
- Error codes: `unauthorized`, `forbidden`, `not_found`, `validation`, `conflict`, `rate_limited`, `internal`.
- All timestamps ISO-8601 UTC.

---

## Employee endpoints

### `GET /api/onboarding/assignments/current`

**Auth**: any authenticated employee.
**Returns**: tuần hiện tại của user.

```json
{
  "ok": true,
  "data": {
    "id": "ckxxx",
    "weekIso": "2026-W18",
    "status": "in_progress",
    "docs": [
      { "knowledgeId": "01HM9...", "title": "Quy trình refund", "readAt": "2026-05-04T03:12:00Z" }
    ],
    "test": {
      "id": "ckyyy",
      "questionCount": 7,
      "passThreshold": 0.7,
      "attemptCount": 0,
      "lastScore": null
    },
    "score": null,
    "submittedAt": null,
    "retryAvailable": false
  }
}
```

### `POST /api/onboarding/assignments/:id/start`

**Body**: empty.
**Effect**: transition `pending → in_progress` if not already.
**Response**: 200 with updated assignment.

### `GET /api/onboarding/assignments/:id/test`

**Returns**: Test + questions (KHÔNG trả `correctOption` — chấm server-side).

```json
{
  "ok": true,
  "data": {
    "id": "ckyyy",
    "passThreshold": 0.7,
    "questions": [
      {
        "id": "qaaa",
        "ord": 1,
        "prompt": "Câu hỏi...",
        "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}],
        "citation": "host/faq/refund.md#chinh-sach"
      }
    ]
  }
}
```

### `POST /api/onboarding/assignments/:id/submit`

**Body**: `{ "answers": [{"questionId": "qaaa", "selectedOption": "B"}, ...] }`.
**Validation**: số answer = questionCount; option phải khớp keys.
**Effect**: chấm điểm, ghi `TestAnswer` với `attemptNumber=1` hoặc `2`. Nếu `attemptCount >= 2 && score < threshold` → `failed_pending_review` + notify admin. Nếu pass → `passed`.

```json
{
  "ok": true,
  "data": {
    "score": 0.85,
    "passed": true,
    "attemptNumber": 1,
    "retryAvailableUntil": null,
    "perQuestion": [
      { "questionId": "qaaa", "isCorrect": true },
      { "questionId": "qbbb", "isCorrect": false }
    ]
  }
}
```

### `POST /api/onboarding/assignments/:id/retry`

**Body**: empty.
**Validation**: status = `pending_retry`, trong vòng 24h kể từ `submittedAt`.
**Effect**: tạo session retry; tiếp theo employee `GET /test` (cùng câu hỏi) rồi `POST /submit` lần 2.

### `POST /api/onboarding/test-questions/:id/report-bad`

**Body**: `{ "reason"?: string ≤ 200 }`.
**Effect**: increment `flaggedByUserCount`, set `flaggedAt`. Không khoá câu — admin xử lý sau.

### `GET /api/onboarding/popups/pending`

**Returns**: popups đã `sent_at` nhưng chưa `responded` cho user.

```json
{
  "ok": true,
  "data": [
    { "id": "pkxxx", "type": "motivation", "contentText": "Chúc anh/chị buổi sáng năng lượng!", "sentAt": "2026-05-04T02:00:00Z" },
    { "id": "pkyyy", "type": "humor", "contentText": "Đố vui: ...", "sentAt": "2026-05-04T03:30:00Z" }
  ]
}
```

### `POST /api/onboarding/popups/:id/respond`

**Body**: `{ "responseText": "...", "humorAnswer"?: "A"|"B"|"C"|"D" }`.
**Effect**: encrypt `responseText` → store; if humor, compare `humorAnswer` with stored correct answer (in `contentText` JSON metadata).
**Response**:
```json
{ "ok": true, "data": { "id": "pkxxx", "humorCorrect": true } }
```

### `POST /api/onboarding/popups/:id/dismiss`

**Body**: empty.
**Effect**: set `responseFlag=dismissed`. KHÔNG giải mã `responseText` (vẫn null).

### `GET /api/onboarding/focus/me`

**Returns**: focus_score tự xem (positive-framed cho UI FR-031).

```json
{
  "ok": true,
  "data": {
    "period": { "kind": "week", "label": "2026-W18" },
    "focusScore": 78,
    "isLow": false,
    "streakWeeksPassed": 5,
    "popupResponseRate": 0.82,
    "humorAccuracy": 0.66
  }
}
```

---

## Admin / Lead endpoints

### `GET /api/onboarding/admin/team`

**Auth**: `lead` (team mình) | `admin` (all).
**Query**: `?period=2026-W18&team=engineering`.
**Returns**: aggregate per-employee.

```json
{
  "ok": true,
  "data": {
    "period": { "kind": "week", "label": "2026-W18" },
    "rows": [
      { "accountId": "abc", "name": "Trân", "focusScore": 78, "isLow": false, "assignmentStatus": "passed", "popupResponseRate": 0.82 },
      { "accountId": "def", "name": "Nam", "focusScore": 54, "isLow": true,  "assignmentStatus": "failed_pending_review", "popupResponseRate": 0.45 }
    ]
  }
}
```

### `GET /api/onboarding/admin/employee/:id`

**Auth**: `lead` (chỉ direct report) | `admin`.
**Returns**: timeline đầy đủ (assignments + popups metadata + admin decisions). Decrypt `responseText` per-popup khi caller có RBAC `self|direct_lead|admin`.

### `POST /api/onboarding/admin/assignments/:id/decide`

**Auth**: `admin`.
**Body**: `{ "decision": "ok"|"request_supplement", "knowledgeTask"?: { topic, audience, level, deadline, levelBased } }`.
**Effect**:
- `ok` → `closed_ok`.
- `request_supplement` + body kèm task → tạo `KnowledgeTask` linked, `closed_supplement`.

### `POST /api/onboarding/admin/knowledge-tasks`

**Auth**: `admin` HOẶC `lead` (cho team mình; FR-014).
**Body**:
```json
{
  "topic": "Quy trình refund cấp lead",
  "audience": ["lead"],
  "level": "mid",
  "deadline": "2026-05-11T00:00:00Z",
  "levelBased": false,
  "relatedAssignmentId": null
}
```
**Validation**: lead chỉ được set audience ⊆ team's roles; deadline trong [+1d, +30d].
**Response**: `KnowledgeTask` record + ID task ai được dispatch.

### `POST /api/onboarding/admin/knowledge-tasks/:id/escalate`

**Auth**: `admin` only.
**Body**: `{ "toAccountId": "lead-or-admin-id", "reason": "..." }`.
**Effect**: set `escalatedAt`, `escalatedToAccountId`, notify target.

### `GET /api/onboarding/admin/knowledge-tasks`

**Auth**: `admin` (all) | `lead` (tasks mình tạo).
**Query**: `?status=pr_open`.
**Returns**: list KnowledgeTask.

---

## Internal / cron endpoints

KHÔNG public. Chỉ pg-boss worker callback hoặc ingest service gọi qua bearer token.

### `POST /api/onboarding/cron/weekly-rollover`

**Auth**: `Authorization: Bearer ${CRON_TOKEN}`.
**Effect**: tạo `WeeklyAssignment` cho mọi active account của tuần hiện tại. Idempotent qua `(accountId, weekIso)` unique.

### `POST /api/onboarding/cron/popup-plan-day`

**Auth**: `Bearer ${CRON_TOKEN}`.
**Body**: `{ "date": "2026-05-04" }` (UTC).
**Effect**: sinh 3–5 `DailyPopup` cho mỗi active account, `scheduledAt` random uniform + 90min gap.

### `POST /api/onboarding/cron/popup-deliver`

**Auth**: `Bearer ${CRON_TOKEN}`.
**Effect**: tìm popup đến hạn → push qua WS event `popup:new` → mark `sent_at`.

### `POST /api/onboarding/cron/expire-assignments`

**Auth**: `Bearer ${CRON_TOKEN}`.
**Effect**: với mỗi assignment `status NOT IN closed_*` và `weekIso < current`, set `expired`.

### `POST /api/onboarding/cron/purge-popup-responses`

**Auth**: `Bearer ${CRON_TOKEN}`.
**Effect**: với popup `purgeAfter < now`, xoá `responseTextEncrypted`, `responseNonce`, set NULL — giữ metadata aggregate.

### `POST /api/onboarding/ingest/knowledge-task-merged`

**Auth**: `Bearer ${INGEST_TOKEN}`.
**Body**: `{ "taskId": "ckxxx", "prUrl": "https://...", "mergedAt": "..." }`.
**Effect**: chuyển status `pr_open → merged → ingested` (sau khi ingest sync xong → call back lần 2 với `ingested`).

---

## WebSocket events

Channel: `account:{accountId}:popup` (auth qua existing socket auth). Server emits:

| Event | Payload |
|---|---|
| `popup:new` | `{ id, type, contentText, sentAt }` |
| `popup:dismissed-by-system` | `{ id }` (khi end-of-day cleanup) |
| `assignment:new` | `{ assignmentId, weekIso }` (khi rollover cron tạo mới) |

Client emits:
| Event | Payload |
|---|---|
| `popup:respond` | `{ popupId, responseText, humorAnswer? }` (proxy về REST `/respond`) |

## Rate limits

| Endpoint | Limit |
|---|---|
| `POST /assignments/:id/submit` | 5/phút/account |
| `POST /test-questions/:id/report-bad` | 20/ngày/account |
| `POST /knowledge-tasks` | 10/ngày/account (admin), 3/ngày/lead |
| `POST /admin/knowledge-tasks/:id/escalate` | 10/ngày/admin |
| `POST /popups/:id/respond` | 100/ngày/account (>3-5 popup là sai schedule, alarm) |
