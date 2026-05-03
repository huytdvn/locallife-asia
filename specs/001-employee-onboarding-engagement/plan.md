# Implementation Plan: Employee Onboarding & Daily Engagement Bot

**Branch**: `001-employee-onboarding-engagement` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-employee-onboarding-engagement/spec.md`

## Summary

Vòng học hàng tuần per-account + 3–5 popup/ngày low-friction để giữ tập trung. Knowledge gap → admin/lead tạo `knowledge_task` → AI soạn PR → admin merge → tuần sau xuất hiện trong assignment. Giao diện anti-stress (vui, microcopy thân tình, không nag). Tận dụng tối đa stack hiện có; không thêm infra mới.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, no `any`) trên Next.js 15 App Router; Python 3.11+ (mypy strict, Pydantic) cho ingest hooks; Node ≥ 22.
**Primary Dependencies**:
- Web: `next@15`, `react@19`, `prisma`, `next-auth`, `framer-motion` (mới — animation), `@radix-ui/*` (existing), `tailwindcss`, `libsodium-wrappers` (mới — encryption).
- Ingest: `fastapi`, existing parsers; KHÔNG thay đổi pipeline core.
- Cron / queue: `pg-boss@10` (mới — Postgres-backed scheduler). KHÔNG thêm Redis/Upstash mới ở v1 (đã có nhưng giữ riêng cho ingest queue).
**Storage**:
- Neon Postgres (existing) — extend Prisma schema với 7 model mới (xem data-model.md).
- Cloudflare R2 (existing) — KHÔNG dùng cho feature này (response_text encrypt + lưu DB; không archive raw popup).
- KMS: app-level libsodium **secretbox** với master key trong env `ONBOARDING_DEK_MASTER`; per-account DEK encrypted-at-rest trong table `account_crypto_key`.
**Testing**: Vitest (web unit), Playwright (e2e UX flows + visual regression cho FR-031), pytest (ingest), eval gate cho RBAC matrix.
**Target Platform**: Web SPA (desktop + mobile responsive); KHÔNG native app v1.
**Project Type**: Web application — extend `apps/web` (frontend + API routes) + minimal hook trong `apps/ingest` cho knowledge_task PR notification.
**Performance Goals**:
- Dashboard render < 2s (FR-019, SC).
- Popup delivery jitter < 60s vs scheduled time.
- Test gen latency P95 < 8s (LLM call) — show skeleton state.
- Cron tick (pg-boss) ≤ 5s lag.
**Constraints**:
- AI cost ≤ $0.15/employee/tháng @ scale 50 (SC-007). Implication: cache popup motivation pool, batch test gen, skip humor for low-engagement accounts.
- Encryption MUST không tăng query latency dashboard > 100ms (aggregate đọc metadata, không decrypt batch).
- Mọi popup respect `is_on_leave` + work_hours (FR-008, edge cases).
**Scale/Scope**: Pilot 1 team (3–5 nhân viên), rollout 50 nhân viên 6 tháng sau MVP. ≤ 2000 daily popups, ≤ 350 weekly assignments/tuần ở scale tối đa v1.

## Constitution Check

*GATE: Pass trước Phase 0; re-check sau Phase 1.*

Reference: `.specify/memory/constitution.md` (v1.0.0).

| # | Principle | Gate question | Pass |
|---|-----------|---------------|------|
| I | Markdown là contract | New content có sống ngoài `knowledge/*.md`? | ✅ Onboarding *state* (assignments, popups, evaluations) là cache/projection — KHÔNG phải knowledge nội dung. Knowledge content vẫn đi qua `knowledge/*.md` PR. |
| II | 3-way text replication | New write path bypass git → local → R2? | ✅ Feature KHÔNG ghi `knowledge/`; chỉ admin/lead tạo `knowledge_task`, AI draft → PR → admin merge → existing sync flow (PR #9). |
| III | One data path | Có shortcut không qua `raw → parse → markdown → ... → answer`? | ✅ Onboarding đọc từ retrieval API hiện có; test gen + assignment chọn doc qua existing Qdrant + RBAC filter. |
| IV | Citation-or-reject | AI surface trả lời không kèm `file#heading`? | ✅ FR-003 ép buộc citation cho mỗi test question. Popup motivation/humor là content sinh từ pool (không phải answer KB), không cần citation; nhưng MUST ghi rõ "đây không phải kiến thức công ty" trong tone guard. |
| V | RBAC tool layer | Filter ở prompt hay ở tool layer? | ✅ FR-023: `canRead()` (rbac.ts) + decrypt scope guard chạy trước context; aggregate stats tính trên metadata, không cần decrypt → không lộ qua LLM. |
| VI | Human-in-the-loop | AI mutate `knowledge/` không qua review? | ✅ AI chỉ `draft_update` → PR; admin (KHÔNG phải lead) có duy nhất quyền merge (FR-014, FR-023). |
| VII | YAGNI | Abstraction / dep / knob nào không có caller ngay? | ⚠ **Cảnh báo**: 31 FRs là rộng. v1 MVP cắt: bỏ FR-013 (Calendar), FR-018 (level-based) defer v2, FR-022 (CSV export) defer v2. Giữ Story 1 + 2 cho MVP, Story 3 + 4 ở v1.1. Xem Complexity Tracking. |

**Stack & compliance gates**:

- [x] No `any` in new TS — strict mode enforced via existing `tsconfig`.
- [x] Pydantic schemas for new Python I/O — chỉ thêm 1 endpoint `/sync/knowledge-task-status` notify trong ingest; có Pydantic model.
- [N/A] New `knowledge/*.md` front-matter — feature KHÔNG tạo doc trực tiếp; AI generate doc qua `draft_update` đã enforce schema.
- [x] Branch tên: `001-employee-onboarding-engagement` — KHÔNG khớp `claude/<scope>-<ticket>` convention. **Justified**: spec-kit feature branch có prefix số tự sinh; constitution amendment / template patch để hoà hợp. Tracked in Complexity Tracking.
- [x] No secrets in diff — `ONBOARDING_DEK_MASTER` ở `.env.local` (gitignored).
- [x] RBAC matrix test — Playwright suite `rbac.spec.ts` đã có 3 role × 3 sensitivity; thêm 4 case mới cho onboarding (employee tự xem / lead xem team mình / admin xem all / cross-team deny).
- [x] New tools: `draft_update_for_knowledge_task` reuse existing `draft_update` schema + audit (no new tool primitive).

## Project Structure

### Documentation (this feature)

```text
specs/001-employee-onboarding-engagement/
├── plan.md              # this file
├── research.md          # Phase 0 — stack & lib decisions
├── data-model.md        # Phase 1 — Prisma schema + entity diagram
├── quickstart.md        # Phase 1 — dev bootstrap + smoke test
├── contracts/
│   └── api.md           # REST endpoints (employee + admin/lead)
└── tasks.md             # Phase 2 — generated by /speckit.tasks
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── (employee)/                      # NEW route group — anti-stress UI
│   │   ├── onboarding/
│   │   │   ├── page.tsx                 # current weekly assignment
│   │   │   ├── test/[id]/page.tsx       # friendly test runner (FR-030)
│   │   │   └── popup-host.tsx           # global popup overlay (FR-029)
│   │   └── layout.tsx                   # warm palette wrapper
│   ├── (admin)/
│   │   └── onboarding/
│   │       ├── dashboard/page.tsx       # team + per-employee aggregate
│   │       ├── employee/[id]/page.tsx   # drill-down timeline
│   │       └── knowledge-tasks/         # task creation, review queue
│   └── api/
│       ├── onboarding/
│       │   ├── assignments/route.ts     # GET current, list
│       │   ├── assignments/[id]/        # submit, retry, close
│       │   ├── popups/                  # pending, respond, dismiss
│       │   ├── knowledge-tasks/         # create (admin|lead), escalate (admin)
│       │   └── focus/                   # employee self-view, team view
│       └── cron/onboarding/             # pg-boss webhook handlers
├── lib/
│   ├── onboarding/
│   │   ├── scheduler.ts                 # pg-boss bootstrap + cron defs
│   │   ├── popup-randomizer.ts          # FR-008 random uniform + 90min gap
│   │   ├── test-gen.ts                  # AI gen 5–10 câu + citation check
│   │   ├── popup-gen.ts                 # motivation/check_in/humor pools
│   │   ├── focus-score.ts               # FR-020 formula
│   │   ├── crypto.ts                    # libsodium wrap; DEK per-account
│   │   └── rbac.ts                      # extend canRead with onboarding scopes
│   └── prisma/                           # schema.prisma extended
├── components/
│   └── onboarding/
│       ├── PopupCard.tsx                # FR-029 dismissable card
│       ├── TestRunner.tsx               # FR-030 progress + auto-save
│       ├── AssignmentList.tsx           # warm palette + microcopy
│       ├── FocusBadge.tsx               # FR-031 positive-framed
│       └── StreakChip.tsx               # progress streak
└── tests/
    ├── unit/onboarding/                  # popup-randomizer, focus-score, crypto
    ├── e2e/onboarding/                   # Playwright golden flow + a11y
    └── visual/                           # FR-031 button/popup snapshots

apps/ingest/
└── app/onboarding/
    └── notify_knowledge_task.py          # 1 endpoint: notify khi PR merged → mark task ingested

prisma/
└── migrations/
    └── 2026_05_xx_onboarding/            # 7 tables + alter account
```

**Structure Decision**: **Web application** (Option 2 trong template). Tất cả logic mới sống trong `apps/web` (frontend + API routes) — không cần backend service riêng. `apps/ingest` chỉ thêm 1 endpoint thông báo. Migration đặt ở `prisma/migrations` theo pattern hiện có. Route group `(employee)` vs `(admin)` để cách ly UI palette + permission mặc định.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **31 FRs (vi phạm YAGNI)** | Spec bao quát toàn vòng (onboarding + engagement + admin workflow + dashboard + UX). Cắt thành phases: **MVP** = Story 1+2 (FR-001..FR-013, FR-023..FR-026, FR-027..FR-031), **v1.1** = Story 3 (FR-014..FR-018), **v1.2** = Story 4 (FR-019..FR-022) + level-based FR-018. | Không cắt = ship chậm 2 tháng + over-build. Cắt nhỏ hơn (chỉ Story 1) = không đủ giá trị để admin verify ROI. |
| **Branch tên `001-...` không theo `claude/<scope>-<ticket>`** | Spec-kit auto-generate branch number; founder chấp nhận khi cài spec-kit. | Đổi tên branch tay = mất link với `specs/001-.../`. Better fix: amendment constitution (PATCH bump) để allow `<NNN>-<short-name>` cho speckit-feature branches. **Action**: tạo follow-up issue, không block PR. |
| **Thêm dep `libsodium-wrappers` + `pg-boss` + `framer-motion`** | (a) libsodium = chuẩn NaCl, well-audited, ~24KB gzip; tránh vendor-lock vào KMS. (b) pg-boss = dùng Postgres sẵn có, không thêm Redis cho onboarding. (c) framer-motion = chuẩn React animation, ~30KB; cần cho FR-028 micro-interaction. | (a) `crypto.subtle` Web API — không có cho server-side Node trong production-ready Edge runtime; tay tự dùng `node:crypto` AES-GCM được nhưng phải tự manage IV + DEK rotation → tự build mini-libsodium = anti-pattern. (b) Upstash Redis = thêm vendor + chi phí; bull/bullmq = cần Redis. (c) CSS-only transitions = không đủ cho FR-028 spring physics; react-spring trùng năng lực với framer-motion nhưng API verbose hơn. |

---

*Phase 0 (research.md) và Phase 1 (data-model.md, contracts/, quickstart.md) được generate cùng PR này. Re-evaluate Constitution Check sau Phase 1 — KẾT QUẢ: vẫn PASS với phân kỳ MVP/v1.1/v1.2 ở Complexity Tracking.*
