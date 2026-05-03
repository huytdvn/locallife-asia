# Feature Specification: Employee Onboarding & Daily Engagement Bot

**Feature Branch**: `001-employee-onboarding-engagement`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Weekly per-account employee onboarding with AI-generated reading docs + tests, daily 3-5 motivational/check-in/humor popups, focus history & evaluation, admin-driven knowledge supplements with deadline, level-based docs"

## Overview

Mở rộng hệ thống chat nội bộ LocalLife thành một **bot onboarding + engagement** chạy nền cho từng nhân viên (employee account). Mỗi tuần bot tạo một lộ trình đọc nhỏ kèm bài kiểm tra; mỗi ngày bot gửi 3–5 popup ngắn (động viên / hỏi tiến độ / test vui) để duy trì sự tập trung. Toàn bộ tương tác có lịch sử + chấm điểm để admin theo dõi và yêu cầu bổ sung kiến thức khi thấy lỗ hổng. AI chỉ soạn — admin duyệt; mọi tài liệu mới đi qua pipeline knowledge hiện có (citation-or-reject).

## Clarifications

### Session 2026-05-03

- Q: Lịch popup hàng ngày dùng pattern nào? → A: B — Random uniform trong khung work-hours của account, ràng buộc khoảng cách tối thiểu 90 phút giữa 2 popup liên tiếp (tránh dồn cụm).
- Q: Test pass threshold + retry policy? → A: B — Pass 70%; cho phép 1 retry trong 24h sau lần submit đầu; fail lần 2 → đẩy admin review (không auto-mark fail) trước khi đóng assignment.
- Q: Bảo mật + retention cho response text của employee? → A: B — Field-level encryption (AES-GCM, KMS-managed key) cho `response_text` + raw answer humor test; retention 12 tháng; chỉ employee + direct lead + admin có quyền decrypt; aggregate stats tính trên metadata, không decrypt.
- Q: Focus score "low" — ngưỡng + auto-action? → A: Ngưỡng `focus_score < 60/100`; auto-action = flag visual trên dashboard + suggest "Nói chuyện 1-1?" cho manager. KHÔNG tự reduce popup, KHÔNG auto-create HR ticket — manager quyết action thật.
- Q: Lead role authority trên knowledge_task? → A: Lead có quyền CREATE task cho team mình + REVIEW PR (comment / request changes); chỉ admin mới `merge` PR và `escalate` deadline. Lead = creator/reviewer; admin = gatekeeper cuối.
- **Bonus (user-added)**: Yêu cầu UX **anti-stress** cho mọi surface employee-facing — giao diện vui, màu tương tác, microcopy thân tình, button low-friction (không confirm dialog cho action đảo ngược được, copy động viên thay lệnh, popup không nag). Đã encode thành FR-027..FR-031 + SC-009..SC-010.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Vòng onboarding tuần (Priority: P1)

Mỗi nhân viên (`audience: employee`/`lead`) đăng nhập sẽ thấy một "weekly assignment": 1–3 tài liệu cần đọc (gen từ knowledge hiện có hoặc bài viết admin gửi) + 1 bài test ngắn (5–10 câu, AI sinh từ chính những doc đó). Hoàn thành test → status `passed`/`failed`. Admin nhận thông báo kết quả và quyết định: **OK** (đóng tuần) hoặc **Request supplement** (yêu cầu bổ sung kiến thức gì + deadline).

**Why this priority**: Là vòng học cốt lõi — không có nó thì bot chỉ là chat thường. Đây là MVP.

**Independent Test**: Tạo 1 employee account, admin gán doc tuần đầu; nhân viên đọc + làm test; admin duyệt OK. Có thể chạy độc lập không cần daily popup hay dashboard.

**Acceptance Scenarios**:

1. **Given** một employee chưa có assignment tuần này, **When** admin tạo (hoặc bot auto-tạo theo lịch hàng tuần), **Then** employee thấy danh sách doc + test khi vào trang chính.
2. **Given** employee submit test, **When** điểm ≥ ngưỡng pass, **Then** assignment chuyển `passed`; admin được notify.
3. **Given** admin xem kết quả, **When** click "Request supplement", **Then** admin nhập "thiếu kiến thức gì" + deadline; AI nhận task soạn doc bổ sung (xem Story 3).
4. **Given** employee không đụng tới assignment đến cuối tuần, **When** thời điểm cron weekly chạy, **Then** assignment đóng status `expired`, ghi nhận vào lịch sử focus.

---

### User Story 2 — Daily engagement popup (Priority: P2)

Trong giờ làm việc (cấu hình theo timezone account), bot gửi **3–5 popup/ngày** rải rác. Mỗi popup là một trong 3 dạng:

- **Motivation**: 1 câu động viên ngắn (tone phù hợp văn hoá công ty — VN, thân tình).
- **Work check-in**: hỏi nhanh "đang làm gì? có blocker không?" — employee trả lời 1 dòng.
- **Quick humor test**: 1 câu hỏi vui 2–3 dòng (logic/đố mẹo/tình huống công việc) — chấm pass/fail nhẹ nhàng.

Tỉ lệ phân bổ mặc định: 2 motivation : 2 check-in : 1 humor (cấu hình được). Mỗi response lưu lịch sử + flag (responded / ignored / answered correctly).

**Why this priority**: Lớp engagement giữ nhân viên focus & mở kênh "low-friction" để admin có data về tình trạng tinh thần / tải làm việc. Không bắt buộc cho MVP nhưng là điểm khác biệt lớn so với SOP đọc tài liệu thuần.

**Independent Test**: Bật feature flag `daily_popups_enabled` cho 1 employee, set timezone, đợi 1 ngày → kiểm tra log có 3–5 popup, response được lưu.

**Acceptance Scenarios**:

1. **Given** employee online trong giờ làm, **When** scheduler đến giờ popup, **Then** UI hiện popup đúng dạng theo tỉ lệ cấu hình.
2. **Given** employee skip popup 3 ngày liên tục, **When** admin xem dashboard, **Then** thấy flag "low engagement" cho account đó.
3. **Given** humor test, **When** employee trả lời sai, **Then** bot phản hồi gợi ý dí dỏm — không trừ điểm onboarding chính thức.

---

### User Story 3 — Admin yêu cầu bổ sung kiến thức + AI gen doc với deadline (Priority: P2)

Khi admin click "Request supplement" (từ Story 1) hoặc tự tạo task, hệ thống tạo một **knowledge task** với: chủ đề, audience, deadline (mặc định 1 tuần), level (entry/mid/senior). AI nhận task → tra knowledge hiện có → soạn doc nháp (markdown + FM) → gửi PR vào `knowledge/` qua flow hiện có (admin duyệt). Nếu admin chọn "tạo doc theo level riêng", AI gen 2–3 phiên bản cùng chủ đề khác sâu/rộng theo level.

**Why this priority**: Đóng vòng feedback admin → AI → doc → onboarding tuần sau. Không có nó, admin chỉ verify được thụ động, không lấp được gap kiến thức.

**Independent Test**: Admin tạo task "Cần doc về quy trình refund cho lead", deadline 1 tuần. Đợi AI submit PR; admin merge; tuần sau doc xuất hiện trong assignment của lead role.

**Acceptance Scenarios**:

1. **Given** admin tạo knowledge task, **When** task ở status `pending`, **Then** AI bắt đầu soạn trong vòng N giờ (cấu hình); progress hiển thị trên dashboard.
2. **Given** AI hoàn thành, **When** PR mở, **Then** admin nhận notify với link PR + diff.
3. **Given** deadline qua mà chưa merge, **When** cron check, **Then** admin được nhắc; nếu vẫn không xử lý 3 ngày tiếp → escalate (notify lead).
4. **Given** admin chọn "level-based", **When** AI gen, **Then** sinh ra 2–3 file riêng `<topic>-entry.md`, `<topic>-mid.md`, `<topic>-senior.md` cùng `id` cluster.

---

### User Story 4 — Dashboard quản lý đánh giá (Priority: P3)

Admin/lead xem dashboard tổng hợp: theo employee và theo team — số onboarding pass/fail/expired, tỉ lệ response popup, điểm trung bình quick humor, "focus score" tổng hợp (công thức transparent). Có filter theo tuần/tháng/level. Click vào employee → timeline tương tác đầy đủ (mỗi popup, mỗi test) để admin tra cứu lúc 1-1.

**Why this priority**: Nhu cầu quản lý — không chặn MVP nhưng cần để feature có giá trị thực sự với admin.

**Independent Test**: Sau khi đã có dữ liệu của Story 1 + 2 cho ≥3 employee qua 1 tuần, admin mở dashboard → thấy bảng + có thể drill-down 1 employee.

**Acceptance Scenarios**:

1. **Given** dữ liệu tuần qua, **When** admin mở dashboard, **Then** thấy aggregate per-employee + per-team trong < 2 giây.
2. **Given** admin chọn 1 employee, **When** drill-down, **Then** thấy timeline đầy đủ + có thể export CSV.
3. **Given** focus score < ngưỡng cấu hình, **When** dashboard render, **Then** flag visual + suggest action ("Nói chuyện 1-1?", "Reduce popup tới 2/ngày?").

---

### Edge Cases

- Employee nghỉ phép → hệ thống nên skip popup + freeze assignment, không tính `expired`. Cần signal "leave" (admin set hoặc tích hợp HR sau).
- Employee role thay đổi giữa tuần (employee → lead) → assignment tuần đó giữ nguyên, tuần sau theo role mới.
- Knowledge task deadline trùng vào ngày nghỉ chung → cron bù sang ngày làm tiếp theo.
- Test AI gen sai (câu hỏi không trả lời được từ doc) → employee có nút "report bad question"; bot không tính câu đó vào điểm; admin nhận flag.
- Popup overlap với meeting (Google Calendar busy) → giảm tần suất, không spam.
- Multi-tenant audience: chỉ apply cho `audience: employee/lead`, **không** apply cho `host` hay `guest` (xem RBAC `apps/web/lib/rbac.ts`).
- Timezone: account ở DN/HCM/HN có cùng giờ làm; hỗ trợ làm việc remote khác múi giờ là out-of-scope v1.

## Requirements *(mandatory)*

### Functional Requirements

**Onboarding (Story 1)**
- **FR-001**: System MUST tạo `weekly_assignment` cho mỗi active employee account vào lịch cố định (mặc định T2 7:00 local time).
- **FR-002**: System MUST chọn 1–3 doc cho mỗi assignment dựa trên: (a) doc do admin push trực tiếp, (b) doc chưa đọc trong knowledge phù hợp role + level, (c) doc do knowledge task vừa merge (Story 3).
- **FR-003**: System MUST gen test 5–10 câu cho assignment, citation-or-reject (mỗi câu đính `file#heading`).
- **FR-004**: Employees MUST thấy assignment khi mở app; có thể đánh dấu doc đã đọc + làm test bất kỳ lúc nào trong tuần.
- **FR-005**: System MUST chấm test (auto) với threshold pass = **70%**, record `passed/failed_pending_review/expired` + attempt_number + thời gian hoàn thành. Cho phép tối đa **1 retry trong 24h** kể từ submit đầu; fail lần 2 chuyển trạng thái `failed_pending_review` (không tự đóng), notify admin để quyết định cuối — tránh AI gen câu hỏi tệ làm employee mất công lao oan.
- **FR-006**: Admin MUST nhận notify mỗi khi 1 assignment kết thúc (pass/fail/expire).
- **FR-007**: Admin MUST có thao tác **OK** (đóng tuần) hoặc **Request supplement** (mở knowledge task mới — xem FR-014).

**Daily engagement (Story 2)**
- **FR-008**: System MUST gửi 3–5 popup/ngày cho mỗi active employee, rải theo **random uniform** trong giờ làm cấu hình của account, với ràng buộc khoảng cách tối thiểu 90 phút giữa 2 popup liên tiếp.
- **FR-009**: Mỗi popup MUST thuộc 1 trong 3 dạng: motivation / work-check-in / humor; tỉ lệ cấu hình được, mặc định 2:2:1.
- **FR-010**: System MUST lưu mỗi response (text + timestamp + flag responded/ignored/answered). Trường text MUST được **field-level encrypt** (AES-GCM, KMS-managed key); chỉ decrypt khi caller có RBAC = `self | direct_lead | admin`. Aggregate stats (response rate, humor accuracy) MUST tính từ metadata không cần decrypt. Retention text = 12 tháng kể từ ngày tạo, sau đó auto-purge (giữ lại metadata cho lịch sử aggregate).
- **FR-011**: Popup content MUST sinh từ AI prompt có guard tone công ty (định nghĩa trong knowledge `internal/00-company/values.md`).
- **FR-012**: Humor test MUST có "report bad question" để loại noise.
- **FR-013**: System MUST respect calendar busy (không popup trong meeting nếu employee đã connect Google Calendar — optional v1).

**Knowledge supplement (Story 3)**
- **FR-014**: Admin **HOẶC lead (cho team của lead đó)** MUST tạo được `knowledge_task` với: topic, audience, level, deadline (default +7 ngày), level-based flag. Lead role có thêm quyền REVIEW PR (comment / request-changes) nhưng **không** có quyền `merge` hay `escalate` — chỉ admin có. Owner trên task ghi rõ creator role để audit phân biệt.
- **FR-015**: AI agent MUST nhận task, tra knowledge hiện có, soạn markdown + FM hợp schema (`knowledge/README.md`), mở PR vào `knowledge/` qua existing GitHub flow.
- **FR-016**: System MUST track task status: `pending → drafting → pr_open → merged → ingested → assigned`. Mỗi chuyển trạng thái record audit.
- **FR-017**: System MUST gửi nhắc admin khi deadline còn 24h và khi quá hạn; quá hạn 3 ngày → escalate lead.
- **FR-018**: Khi level-based flag bật, AI MUST gen 2–3 file riêng theo level (entry/mid/senior) cùng `id` prefix chung và `related` cross-link.

**Dashboard (Story 4)**
- **FR-019**: Admin/lead MUST xem aggregate per-employee + per-team: assignments pass/fail/expired %, popup response rate, humor score, focus score.
- **FR-020**: System MUST tính `focus_score` (thang 0–100) công thức minh bạch (documented), phối hợp 3 input: (a) on-time test, (b) popup response rate, (c) humor accuracy. Trọng số mặc định 50/30/20, cấu hình được. **Ngưỡng "low" mặc định = `< 60`** → dashboard hiển thị flag visual + suggest "Nói chuyện 1-1?" cho manager. System **KHÔNG** tự reduce popup tần suất và **KHÔNG** auto-create HR ticket — quyết định thuộc manager/admin.
- **FR-021**: Admin MUST drill-down 1 employee → timeline đầy đủ tương tác trong khoảng thời gian chọn.
- **FR-022**: System MUST cho export CSV per-employee timeline.

**Cross-cutting**
- **FR-023**: Mọi feature MUST tuân RBAC hiện có (`apps/web/lib/rbac.ts`). Knowledge task creation = `admin` hoặc `lead` (cho team mình); knowledge task `merge` PR + `escalate` deadline = `admin` only. Decrypt response text = `self` (employee đó) / `direct_lead` / `admin`.
- **FR-024**: Tất cả interaction (test answer, popup response, admin verify) MUST ghi audit không thể xoá (giữ ≥ 12 tháng).
- **FR-025**: AI prompt MUST guard tone (động viên — không chỉ trích; humor — không nhạy cảm).
- **FR-026**: System MUST có feature flag `onboarding_bot_enabled` per-account để admin pilot dần.

**UX & tone (anti-stress, employee-facing surfaces)**
- **FR-027**: Giao diện employee-facing (assignment list, popup card, test runner, dashboard cá nhân) MUST theo design language **vui — không công sở khô khan**: palette ấm + accent màu sống (đề xuất pair fresh-jade hiện có với 1 màu nhấn warm vàng/cam cho CTA tích cực), microcopy thân tình tiếng Việt, illustration/emoji có chừng mực — KHÔNG đỏ-cảnh-báo cho fail/expired (chuyển sang amber + tone "thử lại nhé").
- **FR-028**: Mọi nút có-thể-stress (Submit test, Mark fail, Skip popup, Close assignment) MUST có:
  - State loading mềm (skeleton hoặc shimmer, không spinner trắng);
  - Confirm dialog **chỉ** cho action không đảo ngược (vd hard-delete) — submit test KHÔNG cần confirm;
  - Hover/focus state có micro-interaction nhẹ (scale 1.02 hoặc tint shift);
  - Copy nút động viên thay vì lệnh: "Mình nộp bài nhé" thay cho "Submit", "Để lúc khác" thay cho "Cancel".
- **FR-029**: Popup card MUST dismissable bằng `Esc` + click-outside; không bao giờ chiếm full-screen; không block scroll trang chính. Popup chưa response sẽ tự minimize sau 30s thành 1 chip nhỏ góc dưới — KHÔNG nag.
- **FR-030**: Test runner MUST có progress bar friendly (vd "Câu 3/8 — anh/chị làm tốt lắm"), không countdown timer trừ khi admin bật, và auto-save draft mỗi câu để không mất công khi refresh.
- **FR-031**: Dashboard cá nhân (employee tự xem) MUST hiển thị streak / progress positive-framed (vd "5 tuần liên tiếp pass" thay vì "0 lần fail tháng này"); focus score thấp được phrase là "tuần này anh/chị có vẻ bận, cần em hỗ trợ gì không?" không phải "Low focus detected".

### Key Entities

- **Account** *(existing)*: extend với `timezone`, `work_hours`, `level (entry|mid|senior)`, `onboarding_bot_enabled`, `popup_ratio` (override), `is_on_leave`.
- **WeeklyAssignment**: id, account_id, week_iso (`2026-W18`), doc_ids[], test_id, status, assigned_at, completed_at, score, admin_decision (`ok|request_supplement|expired`).
- **Test / TestQuestion / TestAnswer**: AI-generated; mỗi câu link tới citation `file#heading`; answers per-employee.
- **DailyPopup**: id, account_id, type (`motivation|check_in|humor`), content_text, scheduled_at, sent_at, **response_text_encrypted** (AES-GCM, KMS key id), response_flag, humor_correct (nullable), purge_after (timestamp +12 mo). Aggregate readers chỉ đọc metadata; raw decrypt cần RBAC `self|direct_lead|admin`.
- **KnowledgeTask**: id, **created_by_account_id**, **created_by_role** (`admin|lead`), topic, audience, level, deadline, level_based, status, related_assignment_id (nullable — link ngược về source request), pr_url, merged_at, escalated_at (nullable, only set by admin).
- **FocusEvaluation**: account_id, period (week/month), assignments_pass_pct, popup_response_rate, humor_accuracy, focus_score, computed_at.
- **AuditEvent** *(existing pattern)*: extend `kind` enum với onboarding events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ≥ 80% active employee hoàn thành weekly assignment đúng hạn sau 4 tuần ramp-up.
- **SC-002**: Median time admin verify (OK / request supplement) ≤ 24h kể từ lúc test xong.
- **SC-003**: Popup response rate trung bình ≥ 60% trong giờ làm; bot không bị tắt feature flag bởi > 20% account trong 3 tháng đầu.
- **SC-004**: AI-generated test rate "report bad question" ≤ 5% câu hỏi.
- **SC-005**: Knowledge task TTL trung bình (request → merged) ≤ 5 ngày.
- **SC-006**: Focus score correlate (Spearman ρ ≥ 0.5) với manager's qualitative review hàng quý → tín hiệu công thức không trật.
- **SC-007**: Cost AI call: ≤ $0.15/employee/tháng (popup + test gen + knowledge draft) ở scale 50 nhân viên.
- **SC-008**: Zero leak — không có popup/test/doc xuất hiện cho account ngoài role được phép (kiểm bằng RBAC test 3 role × 3 sensitivity).
- **SC-009**: Stress-survey sau pilot 4 tuần: ≥ 80% employee trả lời "không thấy app gây áp lực" (Likert ≥ 4/5); ≤ 5% feedback negative về tone microcopy hay màu sắc.
- **SC-010**: Không có popup chiếm > 30% chiều cao viewport ở mọi breakpoint; mọi nút có-thể-stress (Submit/Mark fail/Close) đạt WCAG AA contrast và có hover/focus state đo được (visual regression test).

## Assumptions

- Hệ chat nội bộ + admin console + knowledge pipeline (`apps/web`, `apps/ingest`, `knowledge/`) đã chạy; feature mới extend, không build lại auth/RBAC/retrieval.
- Account có timezone & work-hours hợp lệ (mặc định Asia/Ho_Chi_Minh, 8:30–18:00) — thiếu thì rơi về default, không fail.
- Knowledge base đã đủ phong phú để bootstrap onboarding tuần đầu (≥ 20 doc `audience: employee/lead`); nếu chưa, admin pre-seed.
- Google Calendar tích hợp là optional — v1 có thể skip, popup chỉ tránh meeting nếu đã connect.
- AI model dùng tiếp Gemini 2.5 Flash (đã cấu hình `apps/web/lib/llm.ts`); không đổi nhà cung cấp ở v1.
- Pilot 1 team (3–5 nhân viên) trước khi rollout toàn công ty.
- Chỉ áp dụng cho audience employee/lead (admin bỏ — admin không cần onboarding như nhân viên thường); host/guest hoàn toàn out-of-scope.
- Notification kênh: trong-app (web push trên dashboard chính); email/Slack là nice-to-have, out-of-scope v1.

## Open Questions / Need Clarification

- ~~Lịch popup~~ — Resolved (Q1, see Clarifications): random uniform + 90-minute min-gap.
- ~~Test pass threshold + retry~~ — Resolved (Q2): 70% + 1 retry trong 24h, fail-2 → admin review.
- ~~Lead authority trên knowledge task~~ — Resolved (Q5): lead = creator + reviewer (PR comment / request-changes); admin = sole `merge` + `escalate` authority.
- ~~Focus score ngưỡng "low" + policy~~ — Resolved (Q4): `< 60/100` → flag dashboard + suggest 1-1; KHÔNG auto reduce popup, KHÔNG auto HR ticket.
- ~~Response text encryption + retention~~ — Resolved (Q3): field-level AES-GCM + KMS key, retention 12 tháng, decrypt RBAC = self / direct_lead / admin.
- **Deferred to /speckit.plan**: Multi-language tone humor — v1 tiếng Việt only (pilot là team VN); localize defer v2.

→ Tất cả `/speckit.clarify` items đã giải quyết hoặc defer. Sẵn sàng chạy `/speckit.plan`.
