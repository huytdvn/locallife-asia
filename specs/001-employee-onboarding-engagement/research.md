# Phase 0 — Research: Employee Onboarding & Daily Engagement Bot

**Date**: 2026-05-03 | **Branch**: `001-employee-onboarding-engagement`

Mục đích: gỡ NEEDS CLARIFICATION còn lại + chốt lựa chọn lib cho 5 vấn đề tech. Mỗi mục: **Decision** / **Rationale** / **Alternatives considered** / **Impact**.

---

## R1. Scheduler — chạy 3–5 popup/account/ngày + weekly assignment cron

**Decision**: `pg-boss@10` (Postgres-backed job queue) trên Neon hiện có. Setup 2 schedule chính:

- `weekly-assignment-rollover` — cron `0 7 * * MON` (T2 07:00 local). Tạo `WeeklyAssignment` cho mọi `account` với `onboarding_bot_enabled=true`, `is_on_leave=false`.
- `daily-popup-plan` — cron `0 0 * * *` mỗi midnight UTC. Với mỗi active account, sinh 3–5 `DailyPopup` với `scheduled_at` random uniform trong `work_hours` của ngày đó, ràng buộc khoảng cách ≥ 90 phút (FR-008). Job worker `popup-deliver` poll mỗi 30s, deliver popup tới account khi `scheduled_at <= now`.
- `popup-deliver-tick` — every 30s; tìm DailyPopup `scheduled_at <= now AND sent_at IS NULL`, push qua web push channel (FR-029) + mark `sent_at`.
- `assignment-expiry` — cron `0 23 * * SUN` (Chủ Nhật 23:00). Bất kỳ assignment chưa pass → status `expired`, ghi audit.

**Rationale**:
- Dùng Postgres sẵn có → 0 infra mới. Constitution VII (YAGNI).
- pg-boss exactly-once delivery + retry built-in; không cần tự build worker pool.
- Job state queryable từ admin dashboard cho visibility (FR-019).
- Scale 50 nhân viên × 5 popup/ngày = 250 popup/ngày = ~9000/tháng — pg-boss xử lý 100× số này không đổ mồ hôi.

**Alternatives considered**:
- BullMQ + Redis/Upstash: cần thêm vendor + chi phí; Redis đã có cho ingest queue nhưng tách namespace để tránh nhiễu — lại thêm 1 connection.
- Vercel Cron: chỉ chạy 1 lần/cron cấu hình; không phù hợp cho per-account staggered popup. Vẫn dùng cho weekly cron đơn giản nếu muốn.
- Temporal: over-engineer cho scale này.

**Impact**: thêm dep `pg-boss`, 1 migration tạo schema `pgboss`. Worker chạy chung Next.js server (instance dài hạn) hoặc tách `apps/scheduler` Node service. **Quyết định**: chạy chung Next.js custom server trong Phase 0; tách service nếu deploy Vercel serverless (vì serverless không giữ worker). MVP local Docker → chung là OK.

---

## R2. KMS + per-account DEK encryption

**Decision**: app-level `libsodium-wrappers` (NaCl `secretbox` = XSalsa20-Poly1305) với **envelope encryption**:

- 1 master key `ONBOARDING_DEK_MASTER` (32 bytes, hex) trong `.env.local`/secret manager. Single key cho v1; rotate qua amendment.
- Mỗi `account` có 1 DEK 32 bytes ngẫu nhiên, lưu encrypted-by-master trong table `account_crypto_key` (`account_id`, `dek_encrypted`, `nonce`, `created_at`).
- `response_text_encrypted` của `DailyPopup` = `secretbox(text, dek, random_nonce)`; lưu cả `nonce` + ciphertext.
- Decrypt path: load DEK encrypted → unwrap với master → decrypt response → trả về caller. Cache DEK in-memory ngắn hạn (60s) per request, không persist.

**Rationale**:
- libsodium = chuẩn NaCl audited, dễ dùng đúng (không leak nonce).
- Envelope cho phép rotate master key mà không re-encrypt toàn bộ payload (chỉ re-wrap DEK).
- KHÔNG vendor-lock vào Cloudflare/AWS KMS — quan trọng vì stack hiện đang spread Neon (Postgres) + Cloudflare (R2) + Google (auth/AI); thêm KMS vendor = thêm 1 trust anchor.
- Latency: secretbox ~1μs per response; bulk decrypt 100 responses < 1ms.

**Alternatives considered**:
- Cloudflare KMS via Workers: tốt cho production-grade, nhưng cần Worker layer trước mọi decrypt → tăng RTT. v1 skip.
- AWS KMS GenerateDataKey: tương tự, vendor mới.
- Postgres `pgcrypto` symmetric: native nhưng key rotation phức tạp + key sống trong DB connection → exposed qua DB dump.
- libsodium `crypto_box` (asymmetric): overkill cho symmetric use case.

**Impact**: thêm dep `libsodium-wrappers`, 1 migration cho `account_crypto_key`, 1 file `apps/web/lib/onboarding/crypto.ts`. Document key rotation procedure trong `quickstart.md`.

---

## R3. DB schema location — extend Prisma `apps/web` vs separate

**Decision**: extend Prisma `apps/web/prisma/schema.prisma` với 7 model mới + alter `account`. Đặt trong namespace logical `// region: Onboarding` block.

**Rationale**:
- Onboarding state đan chéo với `Account`, `Audit`, `KnowledgeDoc` (existing) — separate schema = JOIN cross-DB là pain.
- Migration đi qua flow Prisma hiện có; không cần CI/script mới.
- Constitution VII (YAGNI): 1 schema cho 1 logical app.

**Alternatives considered**:
- Separate `prisma_onboarding/` schema riêng: foreign-key cross-schema phức tạp; cùng Postgres physical DB nhưng schema khác. Không có benefit nào ngoài "tách module" — premature.
- Microservice riêng: out of scope.

**Impact**: 1 migration; xem `data-model.md` chi tiết.

---

## R4. Frontend animation + warm-accent palette

**Decision**:
- **Animation**: `framer-motion@11` cho FR-028 micro-interaction (button hover scale 1.02, popup slide-in spring), FR-029 popup minimize-to-chip. Hạn dùng: chỉ component có-thể-stress. Không dùng cho whole-page transition (cost performance).
- **Palette extension**: tận dụng `fresh-jade` (existing — xem commit `493fd64 style(ui): refresh palette to fresh-jade`) làm primary; thêm `warm-amber-400` (#F5B85C) làm accent CTA tích cực; `coral-soft` (#FF8A7A) cho focus score "low" (KHÔNG đỏ-cảnh-báo). Token đặt trong `tailwind.config.ts` — không hardcode hex.
- **Microcopy library**: file `apps/web/lib/onboarding/copy.vi.ts` chứa pool messages tiếng Việt thân tình; load qua key, dễ A/B sau.

**Rationale**:
- framer-motion ~30KB gzip; đã là chuẩn de-facto cho React animation.
- Palette extension qua Tailwind tokens = 0 churn cho component khác.
- Microcopy tách file = dễ review tone bởi người không-code (founder approve).

**Alternatives considered**:
- react-spring: API verbose, gốc khác (web vs native unified) — không cần.
- CSS-only: không đủ cho spring physics + dismissable choreography.
- Lottie: file size + lib heavy.
- Hardcode color hex: vi phạm Tailwind convention; design token là single source.

**Impact**: dep `framer-motion`, file `copy.vi.ts`, sửa `tailwind.config.ts` (thêm 2 token color). Không thay đổi component existing.

---

## R5. Test question generation + retry semantics

**Decision**:
- Test gen prompt = template ở `apps/web/lib/onboarding/test-gen.ts`:
  ```
  Cho 3 đoạn knowledge sau (kèm `file#heading`), sinh 5–10 câu hỏi
  trắc nghiệm 4 phương án A/B/C/D. Mỗi câu kèm `citation: file#heading`
  của đoạn dùng để soạn câu đó. KHÔNG bịa nội dung ngoài đoạn cho.
  Trả JSON theo schema...
  ```
- Validation pass-through: mỗi question phải có citation hợp lệ (file tồn tại, heading có trong markdown), nếu không → reject + regen (max 2 retry); fail thì admin review trước khi assign.
- Retry policy: employee submit lần 1 → chấm; nếu < 70% → cho retry trong 24h, status `pending_retry`; retry submit ≥ 70% → `passed`; nếu vẫn fail → status `failed_pending_review`, notify admin (FR-005).
- "Report bad question" feature: button trong test runner; khi click, câu đó được gắn flag `flagged_by_user`; aggregate ≥ 3 flag/tuần trên cùng câu → tự loại khỏi pool, notify admin.

**Rationale**:
- Citation-or-reject (constitution IV) hardcoded vào prompt + post-validate.
- Retry trong 24h vừa đủ để employee đọc lại doc + làm bài lại; không quá dài để procrastinate.
- Flag-driven question quality loop = tự cải thiện pool theo thời gian.

**Alternatives considered**:
- LLM judge re-grade: thêm 1 round AI call → tăng cost + latency; v1 skip.
- Manual question bank: founder write tay = không scale.

**Impact**: 1 file `test-gen.ts` + Zod schema `TestQuestionSchema`. Chi phí: ~$0.005/test gen (gemini-flash). Cache theo `doc_ids hash` để giảm regen.

---

## R6. Notification channel cho popup

**Decision**: in-app **toast/popup overlay** (FR-029) là kênh chính v1. Khi user mở dashboard hay route `(employee)/*`, useSocket subscribe channel `account:{id}:popup`. Server push qua **WebSocket** (Next.js custom server với `socket.io` đã có cho chat).

**Rationale**:
- Chat đã có WebSocket infra; reuse 100%, 0 infra mới.
- Không cần web-push API / VAPID setup ở v1.
- Khi user offline → popup queue lại, render lúc next session (skip nếu quá 24h cũ — FR-029 spirit).

**Alternatives considered**:
- Web Push API (VAPID): cần service worker + permission grant; v1 skip, defer v1.2 nếu engagement off-tab cao.
- Email/Slack: out of scope v1 (đã state).

**Impact**: extend WebSocket handler hiện có với 2 event mới: `popup:new`, `popup:respond`. 0 dep mới.

---

## R7. Multi-language tone humor (deferred from clarify)

**Decision**: v1 **tiếng Việt only**. Pilot là team VN; không support i18n switch v1. Microcopy + popup pool toàn bộ Vietnamese. Khi scale ra nhân viên người nước ngoài (v2): introduce `next-intl`, 2 locale `vi`/`en`, dual humor pool.

**Rationale**: pilot scope (3–5 nhân viên VN), YAGNI, zero blocker đến UX core.

**Alternatives considered**: bilingual v1 (vi+en) — nội dung humor tiếng Anh khó match tone công ty Việt; chậm shipping mà không có user; reject.

**Impact**: 0. Note trong `quickstart.md` để v2 follow-up.

---

## Open issues post-research

Không. Tất cả NEEDS CLARIFICATION từ spec đã giải quyết hoặc defer rõ ràng:

| Issue | Status |
|---|---|
| Popup pattern, test threshold, encryption, focus threshold, lead authority | ✅ Resolved /speckit.clarify |
| Scheduler choice | ✅ R1 |
| KMS choice | ✅ R2 |
| DB schema location | ✅ R3 |
| Frontend animation lib | ✅ R4 |
| Test gen prompt + retry | ✅ R5 |
| Popup delivery channel | ✅ R6 |
| Multi-language | ✅ R7 (defer v2) |

→ Sẵn sàng chạy Phase 1 (data-model + contracts + quickstart).
