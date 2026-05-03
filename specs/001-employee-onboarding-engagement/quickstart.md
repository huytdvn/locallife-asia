# Phase 1 — Quickstart: Onboarding & Engagement

**Branch**: `001-employee-onboarding-engagement`
**Audience**: dev mới chạm feature 001 hoặc Claude session sau.

## Prerequisites

- Đã follow `docs/local-setup.md` (root). Chat MVP chạy được local.
- Neon Postgres connection string trong `apps/web/.env.local` (`DATABASE_URL`).
- pnpm 10 + Node ≥ 22.

## 1. Install new deps

```bash
pnpm --filter @locallife/web add pg-boss libsodium-wrappers framer-motion
pnpm --filter @locallife/web add -D @types/libsodium-wrappers
```

## 2. Generate encryption master key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output vào `apps/web/.env.local`:
```env
ONBOARDING_DEK_MASTER=<64-hex-chars>
CRON_TOKEN=<32-hex-chars-cho-pg-boss-callback>
```

⚠ **KHÔNG commit**. `.env.local` đã gitignored. Backup vào 1Password vault `LLA-prod-secrets/onboarding`.

## 3. Run migration

```bash
cd apps/web
pnpm prisma migrate dev --name add-onboarding-engagement
pnpm prisma generate
```

Migration output: 7 model mới + alter `Account` (10 cột mới) + schema `pgboss` cho job queue.

## 4. Backfill encryption keys cho account hiện có

```bash
pnpm --filter @locallife/web exec tsx scripts/onboarding-backfill-keys.ts
```

Script tạo `AccountCryptoKey` cho mọi account `onboardingBotEnabled=true`. Idempotent.

## 5. Bật feature flag cho 1 account thử nghiệm

```sql
UPDATE "Account"
SET "onboardingBotEnabled" = true,
    timezone = 'Asia/Ho_Chi_Minh',
    "workHoursStart" = '08:30',
    "workHoursEnd" = '18:00',
    level = 'entry'
WHERE email = 'tester@locallife.asia';
```

## 6. Start dev server

```bash
pnpm --filter @locallife/web dev
```

Server log sẽ in:
```
[onboarding] pg-boss started, schemas: pgboss
[onboarding] cron registered: weekly-rollover (MON 07:00 UTC+7), popup-plan-day (00:00 UTC+7), popup-deliver (every 30s), expire-assignments (SUN 23:00 UTC+7), purge-popup-responses (every 1d 02:00 UTC+7)
```

## 7. Smoke test

```bash
# Manual trigger weekly rollover (dev only)
curl -X POST http://localhost:3000/api/onboarding/cron/weekly-rollover \
  -H "Authorization: Bearer $CRON_TOKEN"

# Mở employee UI
open http://localhost:3000/onboarding   # cần login với account đã enable

# Manual popup plan
curl -X POST http://localhost:3000/api/onboarding/cron/popup-plan-day \
  -H "Authorization: Bearer $CRON_TOKEN" \
  -d '{"date":"'$(date +%Y-%m-%d)'"}'

# Force deliver pending popup
curl -X POST http://localhost:3000/api/onboarding/cron/popup-deliver \
  -H "Authorization: Bearer $CRON_TOKEN"
```

## 8. Test commands

```bash
# Unit
pnpm --filter @locallife/web test src/lib/onboarding/

# E2E (Playwright)
pnpm --filter @locallife/web exec playwright test tests/e2e/onboarding/

# Visual regression (button + popup snapshots cho FR-031)
pnpm --filter @locallife/web exec playwright test tests/visual/

# RBAC matrix
pnpm --filter @locallife/web test tests/integration/rbac-onboarding.spec.ts

# AI test-gen prompt eval (gold set)
pnpm --filter @locallife/web exec tsx scripts/eval-test-gen.ts
```

## 9. Disable / rollback

Tắt feature flag toàn DB:
```sql
UPDATE "Account" SET "onboardingBotEnabled" = false;
```

Pg-boss queue tự pause job khi không có account active. Migration rollback:
```bash
pnpm prisma migrate resolve --rolled-back add-onboarding-engagement
```
(KHÔNG khuyến khích — dùng feature flag thay vì rollback schema.)

## 10. Production deploy notes

- `ONBOARDING_DEK_MASTER` MUST đặt trong secret manager (1Password / Doppler), KHÔNG inline.
- pg-boss worker chạy chung Next.js custom server. Nếu deploy Vercel serverless: tách `apps/scheduler` Node service (defer khi quyết deploy stack).
- WebSocket: existing socket.io setup; mở thêm namespace `/popup` trong `apps/web/server.ts`.
- Backup retention: `purge-popup-responses` chạy hàng ngày; admin có thể export decrypted CSV trước khi purge bằng `POST /admin/employee/:id/export?include_responses=true` (admin only).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `[onboarding] DEK decrypt fail` log | master key sai / file `.env.local` cũ | check `ONBOARDING_DEK_MASTER` 64 hex chars; rotate qua amendment, KHÔNG đổi tay |
| Popup không hiện | account chưa `onboardingBotEnabled=true` HOẶC `is_on_leave=true` | xem `SELECT id, onboardingBotEnabled, isOnLeave FROM "Account"` |
| Test có question thiếu citation | LLM gen lỗi schema | check `flaggedByUserCount`; admin có thể trigger regen qua `POST /admin/tests/:id/regen` (defer v1.1) |
| Cron job miss schedule | pg-boss worker crashed | restart server; pg-boss tự retry; check `pgboss.job` table |

## Future work (v1.1+)

- Story 3 (knowledge_task workflow đầy đủ — AI agent dispatch, deadline escalation cron).
- Story 4 (admin dashboard polish, CSV export, drill-down timeline UI).
- Multi-language (`next-intl` + en humor pool).
- Web Push API (off-tab notification) — cần VAPID + service worker.
- Calendar integration (Google Calendar busy → skip popup) — defer khi engagement < 50% trong meeting hours.
- Adaptive popup schedule (R1 alternative C) — cần ≥ 30 ngày data per-account.
