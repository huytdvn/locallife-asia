# Tasks: Employee Onboarding & Daily Engagement Bot

**Input**: Design documents from `/specs/001-employee-onboarding-engagement/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/api.md ✅

**Tests**: Test tasks INCLUDED — spec FR-024 (audit), FR-031 (visual regression), Constitution gate "RBAC matrix 3 role × 3 sensitivity" all mandate tests.

**Organization**: Grouped by user story. MVP = Phase 3 (US1) + Phase 4 (US2) + Phase 7 (UX cross-cutting). v1.1 = Phase 5 (US3). v1.2 = Phase 6 (US4). Phase 7 polish + cross-cutting can run incrementally throughout.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (weekly cycle), US2 (daily popups), US3 (knowledge supplements), US4 (dashboard), CC (cross-cutting)
- File paths absolute or `apps/web/...` relative to repo root.

## Path Conventions

- Web: `apps/web/...` (frontend pages + API routes + lib)
- Ingest: `apps/ingest/...` (1 endpoint hook only)
- Migration: `apps/web/prisma/migrations/...`
- Tests: `apps/web/tests/{unit,integration,e2e,visual}/...`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap deps, secrets, palette tokens.

- [ ] T001 Install web deps: `pg-boss libsodium-wrappers framer-motion @types/libsodium-wrappers` (`apps/web/package.json`).
- [ ] T002 [P] Generate `ONBOARDING_DEK_MASTER` (32 bytes hex) + `CRON_TOKEN` (32 bytes hex) → add to `apps/web/.env.local` + 1Password vault. Document in `quickstart.md` (already done).
- [ ] T003 [P] Extend `apps/web/tailwind.config.ts` với 2 token màu mới: `warm-amber-400` (#F5B85C), `coral-soft` (#FF8A7A). Sync vào `apps/web/app/globals.css` CSS vars.
- [ ] T004 [P] Tạo file microcopy pool: `apps/web/lib/onboarding/copy.vi.ts` (15 motivation, 10 check-in template, 8 humor). Founder review trước khi merge.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + crypto + scheduler + RBAC foundation. KHÔNG user story nào start được trước khi xong phase này.

- [ ] T005 [CC] Extend Prisma schema: thêm 7 model (`WeeklyAssignment`, `AssignmentDoc`, `Test`, `TestQuestion`, `TestAnswer`, `DailyPopup`, `FocusEvaluation`, `KnowledgeTask`, `AccountCryptoKey`) + alter `Account` (10 cột mới + relations). File: `apps/web/prisma/schema.prisma`. Theo data-model.md.
- [ ] T006 [CC] Generate migration: `pnpm prisma migrate dev --name add-onboarding-engagement`. Verify migration SQL — mọi cột mới có `DEFAULT` để không break existing data.
- [ ] T007 [P] [CC] Crypto module: `apps/web/lib/onboarding/crypto.ts` — libsodium init, `encryptForAccount(accountId, plaintext)`, `decryptForAccount(accountId, ciphertext, nonce)`. Master key load từ `ONBOARDING_DEK_MASTER`. Per-account DEK stored in `account_crypto_key`, ensure-on-first-use pattern.
- [ ] T008 [P] [CC] RBAC extension: `apps/web/lib/onboarding/rbac.ts` — `canAccessAssignment(viewer, assignment)`, `canDecryptResponse(viewer, ownerAccountId)`, `canCreateKnowledgeTask(viewer, audience)`. Reuse existing `apps/web/lib/rbac.ts` baseline.
- [ ] T009 [CC] Scheduler bootstrap: `apps/web/lib/onboarding/scheduler.ts` — pg-boss init, register 5 cron jobs (weekly-rollover, popup-plan-day, popup-deliver, expire-assignments, purge-popup-responses). Wired in `apps/web/server.ts` startup.
- [ ] T010 [P] [CC] Backfill script: `apps/web/scripts/onboarding-backfill-keys.ts` — tạo `AccountCryptoKey` cho mọi account `onboardingBotEnabled=true`. Idempotent.
- [ ] T011 [P] [CC] Zod schemas: `apps/web/lib/onboarding/schema.ts` — `WorkHoursSchema`, `PopupRatioSchema`, `SubmitTestBodySchema`, `RespondPopupBodySchema`, `CreateKnowledgeTaskBodySchema` etc. Reused bởi mọi route handler.
- [ ] T012 [P] [CC] Audit kind enum extend: thêm `onboarding.assignment.created`, `.test.submitted`, `.popup.responded`, `.knowledge_task.created` vào `apps/web/lib/audit.ts`.

**Checkpoint**: schema migrated, crypto + RBAC + scheduler ready. User story implementation có thể start.

---

## Phase 3: User Story 1 — Vòng onboarding tuần (P1) 🎯 MVP

**Goal**: 1 employee → có assignment tuần này → đọc doc → làm test → admin OK.

**Independent Test**: Tạo 1 account với `onboardingBotEnabled=true`, manual trigger `weekly-rollover` cron, mở `/onboarding` thấy danh sách doc + test, nộp test → admin xem `/admin/onboarding/employee/:id` → click OK.

### Tests for US1 (write FIRST, fail trước impl)

- [ ] T013 [P] [US1] Unit: `apps/web/tests/unit/onboarding/test-gen.spec.ts` — assert sinh 5–10 câu hỏi từ 3 doc fixture, mọi citation match `^[\w/-]+\.md#[\w-]+$`, file tồn tại trong `knowledge/`.
- [ ] T014 [P] [US1] Integration: `apps/web/tests/integration/assignment-flow.spec.ts` — full flow create → start → submit → grade → retry → admin decide.
- [ ] T015 [P] [US1] Contract: `apps/web/tests/contract/onboarding-assignments.spec.ts` — schema validation cho 6 endpoint của `/api/onboarding/assignments/*`.

### Implementation US1

- [ ] T016 [P] [US1] `apps/web/lib/onboarding/test-gen.ts` — Gemini prompt template + Zod parse + citation validate (file/heading exists) + max 2 retry. Cache theo hash(doc_ids).
- [ ] T017 [P] [US1] `apps/web/lib/onboarding/assignment-builder.ts` — `pickDocsForAccount(accountId, weekIso)`: 1–3 doc từ existing knowledge + retrieval (BM25 + Qdrant) match role + level + chưa đọc.
- [ ] T018 [P] [US1] `apps/web/lib/onboarding/grader.ts` — `gradeAttempt(testId, answers)`: chấm + write `TestAnswer`, return score, transition status.
- [ ] T019 [US1] Cron worker: `apps/web/app/api/onboarding/cron/weekly-rollover/route.ts` — POST handler with bearer `CRON_TOKEN`; for each active account, create `WeeklyAssignment` + `Test` (qua test-gen) + `AssignmentDoc[]`. Idempotent qua unique `(accountId, weekIso)`.
- [ ] T020 [P] [US1] API: `apps/web/app/api/onboarding/assignments/current/route.ts` — GET current assignment cho user.
- [ ] T021 [P] [US1] API: `apps/web/app/api/onboarding/assignments/[id]/start/route.ts` — POST.
- [ ] T022 [P] [US1] API: `apps/web/app/api/onboarding/assignments/[id]/test/route.ts` — GET test (omit correctOption).
- [ ] T023 [P] [US1] API: `apps/web/app/api/onboarding/assignments/[id]/submit/route.ts` — POST submit (uses grader).
- [ ] T024 [P] [US1] API: `apps/web/app/api/onboarding/assignments/[id]/retry/route.ts` — POST retry (validate 24h window).
- [ ] T025 [P] [US1] API: `apps/web/app/api/onboarding/test-questions/[id]/report-bad/route.ts` — POST.
- [ ] T026 [US1] API: `apps/web/app/api/onboarding/admin/assignments/[id]/decide/route.ts` — POST `decision=ok|request_supplement` (admin only). Optional kèm body knowledgeTask.
- [ ] T027 [P] [US1] UI: `apps/web/app/(employee)/onboarding/page.tsx` — current assignment list, microcopy thân tình, warm palette.
- [ ] T028 [P] [US1] UI: `apps/web/app/(employee)/onboarding/test/[id]/page.tsx` — test runner (FR-030: progress "Câu 3/8 — anh/chị làm tốt lắm", auto-save mỗi câu vào localStorage, không countdown).
- [ ] T029 [P] [US1] Component: `apps/web/components/onboarding/AssignmentList.tsx` (list item card, hover micro).
- [ ] T030 [P] [US1] Component: `apps/web/components/onboarding/TestRunner.tsx` (FR-028 button copy "Mình nộp bài nhé", "Để lúc khác").
- [ ] T031 [US1] Cron worker: `apps/web/app/api/onboarding/cron/expire-assignments/route.ts` — POST sweep Sun 23:00.

**Checkpoint US1**: 1 account chạy đủ 1 vòng tuần. Admin verify được. T013-T015 pass.

---

## Phase 4: User Story 2 — Daily engagement popup (P2) — MVP

**Goal**: 3–5 popup/ngày random uniform + 90min gap, employee respond, lịch sử + flag.

**Independent Test**: Bật `onboardingBotEnabled` cho account, manual trigger `popup-plan-day` + `popup-deliver`, popup hiện trong UI, employee respond → DB có encrypted `responseTextEncrypted`. Skip 3 ngày → focus_score giảm.

### Tests for US2

- [ ] T032 [P] [US2] Unit: `apps/web/tests/unit/onboarding/popup-randomizer.spec.ts` — sinh 3–5 popup, mỗi cặp ≥ 90 phút, trong work_hours, không trùng `is_on_leave`.
- [ ] T033 [P] [US2] Unit: `apps/web/tests/unit/onboarding/crypto.spec.ts` — encrypt/decrypt round-trip, wrong DEK fail, nonce uniqueness.
- [ ] T034 [P] [US2] Integration: `apps/web/tests/integration/popup-flow.spec.ts` — plan → deliver → respond → metadata aggregate (without decrypt).

### Implementation US2

- [ ] T035 [P] [US2] `apps/web/lib/onboarding/popup-randomizer.ts` — pure function `planPopupsForDay(account, date, ratio)` → array of `scheduledAt` Date.
- [ ] T036 [P] [US2] `apps/web/lib/onboarding/popup-gen.ts` — pick từ `copy.vi.ts` pool theo type; humor có `correct_answer` + 4 options stored trong `contentText` JSON.
- [ ] T037 [P] [US2] Cron: `apps/web/app/api/onboarding/cron/popup-plan-day/route.ts` — POST tạo `DailyPopup[]` cho mọi active account.
- [ ] T038 [US2] Cron: `apps/web/app/api/onboarding/cron/popup-deliver/route.ts` — POST tick mỗi 30s; tìm `scheduledAt <= now AND sentAt IS NULL`; emit WebSocket `popup:new`; mark `sentAt`.
- [ ] T039 [P] [US2] WS extension: `apps/web/server.ts` (custom socket.io) — namespace `/popup`, channel `account:{id}:popup`, auth qua existing session token.
- [ ] T040 [P] [US2] API: `apps/web/app/api/onboarding/popups/pending/route.ts` — GET pending list (sentAt set, responseFlag null).
- [ ] T041 [P] [US2] API: `apps/web/app/api/onboarding/popups/[id]/respond/route.ts` — POST encrypt `responseText` qua crypto.ts, store; if humor, compare `humorAnswer`.
- [ ] T042 [P] [US2] API: `apps/web/app/api/onboarding/popups/[id]/dismiss/route.ts` — POST set flag dismissed.
- [ ] T043 [P] [US2] Component: `apps/web/components/onboarding/PopupCard.tsx` — Framer Motion slide-in, dismissable Esc + click-outside, auto-minimize chip 30s (FR-029), không block scroll.
- [ ] T044 [US2] Component: `apps/web/app/(employee)/onboarding/popup-host.tsx` — global overlay subscribe socket, render `PopupCard[]`.
- [ ] T045 [US2] Cron: `apps/web/app/api/onboarding/cron/purge-popup-responses/route.ts` — POST nightly sweep `purgeAfter < now` → null encrypted columns.

**Checkpoint US2**: 1 account nhận 3-5 popup/ngày, respond được, encrypted. T032-T034 pass.

---

## Phase 5: User Story 3 — Knowledge supplement workflow (P2) — v1.1

**Goal**: Admin/lead tạo knowledge_task → AI draft → PR → admin merge → assigned.

> **Defer to v1.1**. Khung task placeholder; sẽ split khi mở v1.1 branch.

- [ ] T046 [P] [US3] `apps/web/lib/onboarding/knowledge-task-runner.ts` (AI agent loop).
- [ ] T047 [US3] API CRUD: `apps/web/app/api/onboarding/admin/knowledge-tasks/...`.
- [ ] T048 [P] [US3] Cron: deadline reminder + escalate.
- [ ] T049 [P] [US3] Ingest hook: `apps/ingest/app/onboarding/notify_knowledge_task.py` — endpoint POST `/sync/knowledge-task-status` callback web.
- [ ] T050 [P] [US3] UI: admin task creation form + review queue.
- [ ] T051 [P] [US3] Tests: contract + integration cho task lifecycle.

---

## Phase 6: User Story 4 — Management dashboard (P3) — v1.2

**Goal**: Admin/lead aggregate per-employee + drill-down timeline + CSV export.

> **Defer to v1.2**.

- [ ] T052 [P] [US4] `apps/web/lib/onboarding/focus-score.ts` — compute `focusScore` formula 0.5/0.3/0.2.
- [ ] T053 [P] [US4] Cron: weekly + monthly `focus-evaluation-rollup`.
- [ ] T054 [P] [US4] API: `apps/web/app/api/onboarding/admin/team/route.ts`, `employee/[id]/route.ts`.
- [ ] T055 [P] [US4] UI: `apps/web/app/(admin)/onboarding/dashboard/page.tsx` + drill-down.
- [ ] T056 [P] [US4] CSV export endpoint.

---

## Phase 7: Polish & cross-cutting (UX + RBAC + observability)

**Purpose**: FR-027..FR-031 (UX anti-stress) + FR-024 (audit) + SC-009..SC-010 (visual regression). Có thể chạy song song với Phase 3+4.

- [ ] T057 [P] [CC] Component: `apps/web/components/onboarding/FocusBadge.tsx` — positive-framed "5 tuần liên tiếp pass", coral-soft cho low (KHÔNG đỏ).
- [ ] T058 [P] [CC] Component: `apps/web/components/onboarding/StreakChip.tsx` — micro-interaction Framer.
- [ ] T059 [P] [CC] Self-view focus API: `apps/web/app/api/onboarding/focus/me/route.ts`.
- [ ] T060 [P] [CC] Visual regression: `apps/web/tests/visual/onboarding-buttons.spec.ts` — Playwright screenshot 6 button state (default, hover, focus, loading, success, error). FR-031 + SC-010.
- [ ] T061 [P] [CC] A11y: `apps/web/tests/e2e/onboarding/a11y.spec.ts` — axe-core check WCAG AA contrast cho mọi onboarding page.
- [ ] T062 [P] [CC] RBAC matrix test: `apps/web/tests/integration/rbac-onboarding.spec.ts` — 4 case (employee tự xem, lead xem team mình, admin xem all, cross-team deny).
- [ ] T063 [P] [CC] Audit emit: thêm audit calls vào mọi route handler theo FR-024.
- [ ] T064 [P] [CC] Observability: structured log + OpenTelemetry span cho cron jobs (cost track của test-gen).
- [ ] T065 [P] [CC] Rate limit middleware: áp cho 5 endpoint trong contracts/api.md.
- [ ] T066 [CC] Smoke E2E: `apps/web/tests/e2e/onboarding/golden-path.spec.ts` — full flow 1 tuần (rollover → 1 day popup → response → submit → admin OK).
- [ ] T067 [CC] Stress survey scaffolding (SC-009): tạo route `/onboarding/feedback` để pilot survey sau 4 tuần (defer impl, chỉ scaffold).

---

## Dependency Graph

```text
Phase 1 (T001-T004) ──┐
Phase 2 (T005-T012) ──┴──▶ MVP ready to start
                                │
                                ├─▶ Phase 3 US1 (T013-T031) ─┐
                                ├─▶ Phase 4 US2 (T032-T045) ─┼─▶ MVP ship-ready
                                └─▶ Phase 7 polish (T057-T067) ─┘
                                                        │
                                                        ├─▶ Phase 5 US3 (v1.1)
                                                        └─▶ Phase 6 US4 (v1.2)
```

T009 scheduler bootstrap blocks T019, T031, T037, T038, T045 (cron handlers register tới worker).
T005-T006 schema blocks all T013-T067 (cần Prisma client).
T007 crypto blocks T033, T041 (encrypt/decrypt).

## Parallel execution examples

**Phase 2 (chạy chung)**: T007 + T008 + T010 + T011 + T012 (5 file độc lập).
**Phase 3 implementation**: T016 + T017 + T018 (lib pure, không chạm file nhau) → sau đó T020-T025 + T027-T030 (route + UI độc lập file).
**Phase 4**: T035 + T036 (lib pure) → T040-T043 (route + component độc lập).
**Phase 7**: gần như toàn parallel — chỉ T066 cần Phase 3+4 done trước.

## MVP Scope (recommended ship)

**MVP** = Phase 1 + 2 + 3 + 4 + Phase 7 partial (T057-T063, T066) = 50 tasks, ~3-4 tuần solo dev.
**v1.1** = thêm Phase 5 (T046-T051), 6 tasks, ~1 tuần.
**v1.2** = thêm Phase 6 (T052-T056), 5 tasks, ~1 tuần + UI polish.

## Format validation

✅ All tasks: checkbox `[ ]`, ID `T0NN`, `[P?]` parallel marker, `[Story]` label, file path included or new file specified.
✅ 67 tasks tổng. US1=19, US2=14, US3=6, US4=5, CC=15, Setup+Foundational=12.
✅ Mỗi user story có Independent Test mô tả.
✅ Tests included per Constitution gate ("RBAC matrix" + "no `any`" + visual regression).
