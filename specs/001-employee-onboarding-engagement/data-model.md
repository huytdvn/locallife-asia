# Phase 1 — Data Model: Employee Onboarding & Daily Engagement Bot

**Branch**: `001-employee-onboarding-engagement` | **Source**: extends `apps/web/prisma/schema.prisma`

7 model mới + alter `Account`. Tất cả enum đặt trong cùng file Prisma.

## Entity diagram (logical)

```text
Account (existing)
  ├── 1..N WeeklyAssignment
  │        ├── 1..N AssignmentDoc      (link tới KnowledgeDoc existing)
  │        └── 1..1 Test
  │                 └── 1..N TestQuestion
  │                          └── 1..N TestAnswer  (per attempt)
  ├── 1..N DailyPopup
  ├── 1..N FocusEvaluation
  └── 1..1 AccountCryptoKey

KnowledgeTask
  ├── created_by → Account (admin or lead)
  ├── related_assignment? → WeeklyAssignment (nullable)
  └── pr_url → external (github)
```

## Prisma schema (paste into `apps/web/prisma/schema.prisma`)

```prisma
// region: Onboarding & Engagement Bot — added 2026-05-03 (spec 001)

enum OnboardingLevel {
  entry
  mid
  senior
}

enum AssignmentStatus {
  pending          // assigned, not started
  in_progress      // employee opened ≥ 1 doc
  submitted        // first test submitted, awaiting grade
  pending_retry    // first attempt < 70%, retry window open (≤ 24h)
  failed_pending_review  // retry also failed, awaiting admin decision
  passed
  expired
  closed_ok        // admin verified OK
  closed_supplement // admin requested knowledge supplement
}

enum AdminDecision {
  ok
  request_supplement
  expired
}

enum PopupType {
  motivation
  check_in
  humor
}

enum PopupResponseFlag {
  responded
  ignored
  dismissed
}

enum KnowledgeTaskStatus {
  pending
  drafting
  pr_open
  merged
  ingested
  assigned
}

enum CreatedByRole {
  admin
  lead
}

// === Account extension (alter existing model) ===

model Account {
  // ... existing fields ...
  timezone               String    @default("Asia/Ho_Chi_Minh")
  workHoursStart         String    @default("08:30")     // "HH:MM"
  workHoursEnd           String    @default("18:00")
  level                  OnboardingLevel @default(entry)
  onboardingBotEnabled   Boolean   @default(false)
  popupRatioOverride     Json?     // { motivation: 2, check_in: 2, humor: 1 } — null = use default
  isOnLeave              Boolean   @default(false)
  leaveUntil             DateTime?

  // relations
  weeklyAssignments      WeeklyAssignment[]
  dailyPopups            DailyPopup[]
  focusEvaluations       FocusEvaluation[]
  cryptoKey              AccountCryptoKey?
  knowledgeTasksCreated  KnowledgeTask[]    @relation("createdBy")

  @@index([onboardingBotEnabled, isOnLeave])
}

// === New models ===

model WeeklyAssignment {
  id                    String           @id @default(cuid())
  accountId             String
  account               Account          @relation(fields: [accountId], references: [id])
  weekIso               String           // "2026-W18"
  status                AssignmentStatus @default(pending)
  adminDecision         AdminDecision?
  adminDecisionBy       String?          // account_id
  adminDecisionAt       DateTime?
  assignedAt            DateTime         @default(now())
  startedAt             DateTime?
  submittedAt           DateTime?
  retrySubmittedAt      DateTime?
  closedAt              DateTime?
  score                 Float?           // 0..1, last attempt
  attemptCount          Int              @default(0)

  test                  Test?
  docs                  AssignmentDoc[]
  knowledgeTasks        KnowledgeTask[]  @relation("relatedAssignment")

  @@unique([accountId, weekIso])
  @@index([status, weekIso])
}

model AssignmentDoc {
  id           String           @id @default(cuid())
  assignmentId String
  assignment   WeeklyAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  knowledgeId  String           // existing KnowledgeDoc.id (ULID)
  position     Int              // ordering
  readAt       DateTime?

  @@unique([assignmentId, knowledgeId])
  @@index([assignmentId])
}

model Test {
  id                String         @id @default(cuid())
  assignmentId      String         @unique
  assignment        WeeklyAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  generatedAt       DateTime       @default(now())
  passThreshold     Float          @default(0.70)
  questionCount     Int

  questions         TestQuestion[]
}

model TestQuestion {
  id                String        @id @default(cuid())
  testId            String
  test              Test          @relation(fields: [testId], references: [id], onDelete: Cascade)
  ord               Int
  prompt            String
  options           Json          // [{key:"A", text:"..."}, ...]
  correctOption     String        // "A"|"B"|"C"|"D"
  citation          String        // "file#heading"
  flaggedByUserCount Int          @default(0)
  flaggedAt         DateTime?

  answers           TestAnswer[]
  @@index([testId])
}

model TestAnswer {
  id              String        @id @default(cuid())
  questionId      String
  question        TestQuestion  @relation(fields: [questionId], references: [id], onDelete: Cascade)
  attemptNumber   Int           // 1 = first submit, 2 = retry
  selectedOption  String?
  isCorrect       Boolean
  reportedBad     Boolean       @default(false)
  answeredAt      DateTime      @default(now())

  @@unique([questionId, attemptNumber])
  @@index([questionId, attemptNumber])
}

model DailyPopup {
  id                       String              @id @default(cuid())
  accountId                String
  account                  Account             @relation(fields: [accountId], references: [id])
  type                     PopupType
  contentText              String              // popup question/message — content pool source, not response
  scheduledAt              DateTime
  sentAt                   DateTime?
  responseTextEncrypted    Bytes?              // libsodium secretbox ciphertext (FR-010)
  responseNonce            Bytes?              // 24 bytes, paired with ciphertext
  responseFlag             PopupResponseFlag?
  humorCorrect             Boolean?            // only for type=humor
  humorReportedBad         Boolean             @default(false)
  purgeAfter               DateTime            // scheduledAt + 12 months — used by retention purge job

  @@index([accountId, scheduledAt])
  @@index([sentAt, responseFlag])     // for aggregate stats without decrypt
  @@index([purgeAfter])
}

model FocusEvaluation {
  id                       String   @id @default(cuid())
  accountId                String
  account                  Account  @relation(fields: [accountId], references: [id])
  periodKind               String   // "week" | "month"
  periodLabel              String   // "2026-W18" or "2026-04"
  assignmentsPassPct       Float    // 0..1
  popupResponseRate        Float    // 0..1
  humorAccuracy            Float    // 0..1, null-coalesced to 0 if no humor popups
  focusScore               Float    // 0..100, formula = 0.5*pass + 0.3*resp + 0.2*humor
  isLow                    Boolean  // computed: focusScore < 60
  computedAt               DateTime @default(now())

  @@unique([accountId, periodKind, periodLabel])
  @@index([periodKind, periodLabel, isLow])
}

model KnowledgeTask {
  id                       String              @id @default(cuid())
  createdByAccountId       String
  createdBy                Account             @relation("createdBy", fields: [createdByAccountId], references: [id])
  createdByRole            CreatedByRole
  topic                    String
  audience                 Json                // ["employee","lead"] etc.
  level                    OnboardingLevel?
  deadline                 DateTime
  levelBased               Boolean             @default(false)
  status                   KnowledgeTaskStatus @default(pending)
  relatedAssignmentId      String?
  relatedAssignment        WeeklyAssignment?   @relation("relatedAssignment", fields: [relatedAssignmentId], references: [id])
  prUrl                    String?
  draftingStartedAt        DateTime?
  prOpenedAt               DateTime?
  mergedAt                 DateTime?
  ingestedAt               DateTime?
  escalatedAt              DateTime?           // only set by admin
  escalatedToAccountId     String?

  @@index([status, deadline])
  @@index([createdByAccountId])
}

model AccountCryptoKey {
  accountId      String   @id
  account        Account  @relation(fields: [accountId], references: [id])
  dekEncrypted   Bytes    // master-encrypted DEK
  dekNonce       Bytes    // 24 bytes
  createdAt      DateTime @default(now())
  rotatedAt      DateTime?
}

// endregion: Onboarding
```

## Validation rules (enforced at route handler + Zod schema)

| Field | Rule |
|-------|------|
| `Account.workHoursStart` / `End` | Format `HH:MM` 24h, `start < end`, 06:00–22:00 range |
| `Account.popupRatioOverride` | sum keys ∈ [3, 5]; keys ⊆ {motivation, check_in, humor} |
| `WeeklyAssignment.score` | 0 ≤ score ≤ 1 |
| `WeeklyAssignment.attemptCount` | ≤ 2 |
| `Test.passThreshold` | 0.5 ≤ x ≤ 1.0 (default 0.70) |
| `TestQuestion.options` | length ∈ [2, 5], unique keys |
| `TestQuestion.citation` | `^[\w/-]+\.md#[\w-]+$`, file MUST exist in knowledge/ |
| `TestQuestion.correctOption` | MUST match one option key |
| `DailyPopup.scheduledAt` | trong work_hours của account; gap ≥ 90 phút với popup gần nhất cùng ngày |
| `DailyPopup.responseTextEncrypted` | nullable; nếu present, `responseNonce` MUST present |
| `KnowledgeTask.deadline` | > now + 1 day, ≤ now + 30 days |
| `KnowledgeTask.audience` | non-empty array, values ⊆ {host, employee, lead, admin} |
| `FocusEvaluation.focusScore` | computed = `100 * (0.5*pass + 0.3*resp + 0.2*humor)` (weights from config) |

## State transitions

### `WeeklyAssignment.status`

```text
pending ──open doc──▶ in_progress ──submit test──▶ submitted
                                                     │
                                                     ├──score≥0.70──▶ passed ──admin OK──▶ closed_ok
                                                     │                                  └──admin supplement──▶ closed_supplement
                                                     └──score<0.70──▶ pending_retry
                                                                       │
                                                                       ├──retry≥0.70──▶ passed (same path)
                                                                       └──retry<0.70──▶ failed_pending_review
                                                                                          │
                                                                                          ├──admin OK──▶ closed_ok
                                                                                          └──admin supplement──▶ closed_supplement

(any status except closed_*)──Sun 23:00 cron──▶ expired
```

### `KnowledgeTask.status`

```text
pending ──ai picks up──▶ drafting ──open PR──▶ pr_open ──admin merge──▶ merged
                                                                          │
                                                                          ▼
                                                                  ingest sync──▶ ingested
                                                                                   │
                                                                                   ▼
                                                                       next-week assignment──▶ assigned
```

### `DailyPopup.responseFlag`

```text
sent ──user types reply──▶ responded
sent ──30s no reply──▶ minimize chip──▶ if dismissed manually──▶ dismissed
                                      └──end-of-day not opened──▶ ignored
```

## Indexes & query patterns

| Query | Index used |
|-------|-----------|
| List active employees với onboarding bật | `Account(onboardingBotEnabled, isOnLeave)` |
| Current week's assignment cho 1 account | `WeeklyAssignment(accountId, weekIso)` unique |
| Pending popup đến deliver | `DailyPopup(accountId, scheduledAt)` |
| Popup aggregate without decrypt (response rate) | `DailyPopup(sentAt, responseFlag)` |
| Low-focus team view | `FocusEvaluation(periodKind, periodLabel, isLow)` |
| Knowledge tasks gần deadline | `KnowledgeTask(status, deadline)` |
| Retention purge sweep | `DailyPopup(purgeAfter)` |

## Migration plan

1. Tạo migration mới: `prisma migrate dev --name add-onboarding-engagement`.
2. Nếu Account đã có data: cần `DEFAULT` cho mọi field mới (đã set ở schema).
3. Backfill `account_crypto_key` cho mọi account `onboardingBotEnabled=true` qua seed script `scripts/onboarding-backfill-keys.ts`.
4. pg-boss tạo schema riêng `pgboss` qua `pg-boss start` lần đầu — không xung đột với app schema.
