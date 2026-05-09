-- Seed onboarding_flow mẫu cho 5 role: employee, lead, host, lok, guest.
-- Idempotent (check title trước insert). Mỗi flow 2 step, mỗi step 1 doc + 2 MC.
-- Audience role được broadcast qua onboarding_assignment (target_role).
-- Ngắn để không tốn token gen mock; admin có thể edit/extend qua /admin/onboarding/new sau.

BEGIN;

-- Helper: insert flow + steps + docs + questions + role-broadcast assignment.
-- Dùng CTE chain. Skip nếu title đã tồn tại.

-- ─── 1. EMPLOYEE ──────────────────────────────────────────────────
WITH new_flow AS (
  INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
  SELECT
    'Tuần đầu nhân viên · Hiểu giá trị Local Life',
    'Mở màn nhẹ nhàng — biết mình đang ở đâu 🌱',
    'Lộ trình mặc định cho employee mới: hiểu sứ mệnh + làm quen sản phẩm.',
    'system@locallife.asia', 70, 'published'
  WHERE NOT EXISTS (SELECT 1 FROM onboarding_flow WHERE title = 'Tuần đầu nhân viên · Hiểu giá trị Local Life')
  RETURNING id
),
s1 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT id, 0,
    'Hiểu sứ mệnh nền tảng',
    'Đọc qua bài giới thiệu tầm nhìn để hiểu Local Life Asia làm gì + tại sao lại làm.',
    'Trả đúng ≥ 1/2 câu'
  FROM new_flow RETURNING id, flow_id
),
s2 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT flow_id, 1,
    'Quy trình + công cụ nội bộ',
    'Vào kho tài liệu nội bộ + biết tra cứu khi cần. Bí kíp: dùng Trợ lý AI để hỏi nhanh.',
    'Trả đúng ≥ 1/2 câu'
  FROM s1 RETURNING id, flow_id
),
s1_doc AS (
  INSERT INTO onboarding_step_doc (step_id, doc_path, heading_anchor, highlight, reason)
  SELECT id,
    'public/about/gioi-thieu-local-life-asia-nen-tang-du-lich-ben-vung.md',
    NULL,
    'Local Life Asia là nền tảng kết nối cộng đồng địa phương với khách trải nghiệm.',
    'Trang giới thiệu chính thức của nền tảng'
  FROM s1
),
s1_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🤔 Local Life Asia chủ yếu kết nối điều gì?',
    ARRAY['Cộng đồng địa phương ↔ khách trải nghiệm','Ngân hàng ↔ doanh nghiệp','Sàn TMĐT ↔ shop','Studio ↔ MC']::text[],
    0,
    'Cốt lõi: cầu nối giữa người dân địa phương và khách muốn trải nghiệm văn hoá thật.',
    ARRAY[]::text[], 1
  FROM s1
  UNION ALL
  SELECT id, '💡 Đặc trưng nổi bật của trải nghiệm trên nền tảng?',
    ARRAY['Du lịch trải nghiệm bản địa, bền vững','Combo nghỉ dưỡng cao cấp','Tour đoàn lớn rẻ','Vé sự kiện ca nhạc']::text[],
    0,
    'Bền vững + bản địa là 2 từ khoá định hình mọi sản phẩm Local Life.',
    ARRAY[]::text[], 1
  FROM s1
),
s2_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🎯 Khi tìm tài liệu nội bộ, bạn nên dùng?',
    ARRAY['Trợ lý AI Bé Tre','Hỏi đồng nghiệp trước','Search Google','Mở Excel cá nhân']::text[],
    0,
    'Trợ lý AI Bé Tre đã được train trên kho doc nội bộ — luôn kèm citation.',
    ARRAY[]::text[], 1
  FROM s2
  UNION ALL
  SELECT id, '🌟 Khi tài liệu chưa rõ, bước tiếp theo là?',
    ARRAY['Báo lead/admin để bổ sung doc','Tự đoán','Bỏ qua','Tự viết doc rồi push']::text[],
    0,
    'Báo để admin tạo knowledge_task → AI gen doc bổ sung. Tránh tự push gây trùng.',
    ARRAY[]::text[], 1
  FROM s2
)
INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
SELECT id, 'employee', 'system@locallife.asia' FROM new_flow;


-- ─── 2. LEAD ──────────────────────────────────────────────────────
WITH new_flow AS (
  INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
  SELECT
    'Lead onboarding · Quản lý team + duyệt tài liệu',
    'Lead vững — team chạy đều 🚀',
    'Lộ trình cho lead mới: quy trình duyệt doc + quản lý team.',
    'system@locallife.asia', 70, 'published'
  WHERE NOT EXISTS (SELECT 1 FROM onboarding_flow WHERE title = 'Lead onboarding · Quản lý team + duyệt tài liệu')
  RETURNING id
),
s1 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT id, 0, 'Trách nhiệm lead trong workflow doc',
    'Lead duyệt PR knowledge_task + đóng vai trò giữ chuẩn nội dung. Đọc qua quy trình.',
    'Trả đúng ≥ 1/2 câu'
  FROM new_flow RETURNING id, flow_id
),
s2 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT flow_id, 1, 'Đào tạo team + theo dõi focus score',
    'Lead xem dashboard onboarding để biết team mình ai cần hỗ trợ.',
    'Trả đúng ≥ 1/2 câu'
  FROM s1 RETURNING id, flow_id
),
s1_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🎯 Khi employee đề xuất doc mới, lead làm gì đầu tiên?',
    ARRAY['Review nội dung + duyệt audience phù hợp','Merge ngay','Bỏ qua','Tự viết lại từ đầu']::text[],
    0,
    'Lead là gate quality — review trước khi merge để tránh nhiễm doc sai.',
    ARRAY[]::text[], 1
  FROM s1
  UNION ALL
  SELECT id, '💡 Sensitivity restricted nghĩa là?',
    ARRAY['Chỉ admin/lead xem được','Mọi role','Chỉ employee','Chỉ host']::text[],
    0,
    'Restricted = nội dung nhạy cảm (pricing, hợp đồng…). Hệ thống tự enforce.',
    ARRAY[]::text[], 1
  FROM s1
),
s2_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🤔 Focus score thấp ở employee có nghĩa?',
    ARRAY['Có thể cần can thiệp/hỗ trợ','Họ giỏi','Bỏ qua được','Nghỉ việc']::text[],
    0,
    'Score < 60 là signal sớm — lead nên 1-1 với employee đó để hiểu lý do.',
    ARRAY[]::text[], 1
  FROM s2
  UNION ALL
  SELECT id, '🌟 Lead xem dashboard onboarding ở đâu?',
    ARRAY['/admin/onboarding','/dashboard','/admin/users','/training']::text[],
    0,
    'Trung tâm đào tạo (/admin/onboarding) là 1 nơi xem mọi metric team.',
    ARRAY[]::text[], 1
  FROM s2
)
INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
SELECT id, 'lead', 'system@locallife.asia' FROM new_flow;


-- ─── 3. HOST ──────────────────────────────────────────────────────
WITH new_flow AS (
  INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
  SELECT
    'Host khởi động · Đăng ký + nhận booking đầu',
    'Sẵn sàng đón những vị khách đầu tiên 🏡',
    'Lộ trình host mới: hoàn thiện hồ sơ + xử lý booking đầu.',
    'system@locallife.asia', 70, 'published'
  WHERE NOT EXISTS (SELECT 1 FROM onboarding_flow WHERE title = 'Host khởi động · Đăng ký + nhận booking đầu')
  RETURNING id
),
s1 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT id, 0, 'Hoàn thiện hồ sơ host',
    'Hồ sơ chỉn chu = booking đến nhanh hơn. Đọc hướng dẫn đăng ký.',
    'Trả đúng ≥ 1/2 câu'
  FROM new_flow RETURNING id, flow_id
),
s2 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT flow_id, 1, 'Xử lý booking + giao tiếp khách',
    'Quy trình check-in/check-out + tone giao tiếp.',
    'Trả đúng ≥ 1/2 câu'
  FROM s1 RETURNING id, flow_id
),
s1_doc AS (
  INSERT INTO onboarding_step_doc (step_id, doc_path, heading_anchor, highlight, reason)
  SELECT id,
    'host/onboarding/huong-dan-dang-ky-luu-tru-va-trai-nghiem-tren-locallife-asia.md',
    NULL,
    'Hồ sơ đầy đủ: ảnh thật, mô tả rõ, giá hợp lý, chính sách hủy minh bạch.',
    'Hướng dẫn đầy đủ về đăng ký lưu trú/trải nghiệm'
  FROM s1
),
s1_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🏡 Yếu tố nào tăng tỉ lệ khách book chỗ của bạn nhất?',
    ARRAY['Ảnh thật + mô tả chi tiết + giá rõ ràng','Giá rẻ nhất khu vực','Đăng nhiều chỗ trống','Quảng cáo trên FB']::text[],
    0,
    'Khách Local Life đề cao trải nghiệm thật — minh bạch + chỉn chu thắng giá.',
    ARRAY[]::text[], 1
  FROM s1
  UNION ALL
  SELECT id, '💡 Khi cập nhật giá, bạn cần?',
    ARRAY['Đảm bảo phản ánh đúng dịch vụ','Tăng càng cao càng tốt','Để mặc định','Đợi LLA gọi']::text[],
    0,
    'Giá hợp lý + đúng dịch vụ giúp giữ uy tín dài hạn trên nền tảng.',
    ARRAY[]::text[], 1
  FROM s1
),
s2_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🎯 Khi gặp sự cố với khách, bạn liên hệ?',
    ARRAY['Kênh hỗ trợ Local Life Asia','Tự xử lý không báo','Đăng FB','Đợi khách phản hồi']::text[],
    0,
    'Đội hỗ trợ luôn có — báo sớm để giải quyết kịp + bảo vệ uy tín.',
    ARRAY[]::text[], 1
  FROM s2
  UNION ALL
  SELECT id, '🌟 Tone giao tiếp với khách nên?',
    ARRAY['Thân thiện, chân thành, rõ ràng','Nghiêm trang','Tin nhắn ngắn cộc lốc','Càng ít trao đổi càng tốt']::text[],
    0,
    'Trải nghiệm tốt bắt đầu từ giao tiếp ấm — khách quay lại + giới thiệu.',
    ARRAY[]::text[], 1
  FROM s2
)
INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
SELECT id, 'host', 'system@locallife.asia' FROM new_flow;


-- ─── 4. LOK ───────────────────────────────────────────────────────
WITH new_flow AS (
  INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
  SELECT
    'LOK starter · Tiếng nói địa phương',
    'Trở thành đại sứ bản địa đáng tin cậy 🌟',
    'Lộ trình LOK mới: hiểu vai trò + tạo nội dung trung thực.',
    'system@locallife.asia', 70, 'published'
  WHERE NOT EXISTS (SELECT 1 FROM onboarding_flow WHERE title = 'LOK starter · Tiếng nói địa phương')
  RETURNING id
),
s1 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT id, 0, 'Hiểu vai trò LOK',
    'LOK = Local Opinions / KOL-KOC bản địa. Nắm tinh thần chương trình.',
    'Trả đúng ≥ 1/2 câu'
  FROM new_flow RETURNING id, flow_id
),
s2 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT flow_id, 1, 'Sản xuất nội dung chuẩn LOK',
    'Trung thực + tuân thủ điều khoản = uy tín dài hạn.',
    'Trả đúng ≥ 1/2 câu'
  FROM s1 RETURNING id, flow_id
),
s1_doc AS (
  INSERT INTO onboarding_step_doc (step_id, doc_path, heading_anchor, highlight, reason)
  SELECT id,
    'lok/onboarding/onboarding-dai-su-du-lich-ban-dia-lok.md',
    NULL,
    'LOK chia sẻ trải nghiệm thật để cộng đồng tin tưởng nền tảng.',
    'Tài liệu onboarding chính cho LOK mới'
  FROM s1
),
s1_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🌟 LOK viết tắt của khái niệm nào?',
    ARRAY['Local Opinions / KOL-KOC bản địa','Local Online Knowledge','Long Online Kit','Logistics Online Keeper']::text[],
    0,
    'LOK là chương trình cộng tác viên KOL-KOC địa phương.',
    ARRAY[]::text[], 1
  FROM s1
  UNION ALL
  SELECT id, '💡 Vai trò chính của LOK?',
    ARRAY['Giới thiệu trải nghiệm bản địa chân thực','Bán hàng đa cấp','Viết review thuê','Quản lý booking']::text[],
    0,
    'LOK chia sẻ trải nghiệm thật để cộng đồng tin tưởng nền tảng.',
    ARRAY[]::text[], 1
  FROM s1
),
s2_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🎯 Khi đăng nội dung gắn Local Life, LOK cần?',
    ARRAY['Trung thực + tuân thủ điều khoản','Chỉ khen','Sao chép từ host','Đăng nặc danh']::text[],
    0,
    'Trung thực + đúng điều khoản là nền tảng uy tín dài hạn.',
    ARRAY[]::text[], 1
  FROM s2
  UNION ALL
  SELECT id, '🤔 Nếu trải nghiệm có điểm chưa tốt?',
    ARRAY['Phản hồi xây dựng để cải thiện','Im lặng','Chỉ khen','Bóc phốt cá nhân']::text[],
    0,
    'Phản hồi xây dựng → cộng đồng + host cùng tốt lên.',
    ARRAY[]::text[], 1
  FROM s2
)
INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
SELECT id, 'lok', 'system@locallife.asia' FROM new_flow;


-- ─── 5. GUEST (public) ────────────────────────────────────────────
WITH new_flow AS (
  INSERT INTO onboarding_flow (title, motto, brief, created_by, pass_threshold, status)
  SELECT
    'Khách mới · 5 phút làm quen Local Life',
    'Một bài nhanh — biết nền tảng làm gì 🌏',
    'Lộ trình ngắn cho khách public: nền tảng là gì + dùng thế nào.',
    'system@locallife.asia', 60, 'published'
  WHERE NOT EXISTS (SELECT 1 FROM onboarding_flow WHERE title = 'Khách mới · 5 phút làm quen Local Life')
  RETURNING id
),
s1 AS (
  INSERT INTO onboarding_step (flow_id, idx, goal, intro, pass_criteria)
  SELECT id, 0, 'Local Life Asia là gì',
    'Đọc 1 bài giới thiệu ngắn + trả lời 2 câu để chốt.',
    'Trả đúng ≥ 1/2 câu'
  FROM new_flow RETURNING id, flow_id
),
s1_doc AS (
  INSERT INTO onboarding_step_doc (step_id, doc_path, heading_anchor, highlight, reason)
  SELECT id,
    'public/about/gioi-thieu-local-life-asia-nen-tang-du-lich-ben-vung.md',
    NULL,
    'Nền tảng kết nối khách trải nghiệm với cộng đồng địa phương.',
    'Trang giới thiệu ngắn gọn'
  FROM s1
),
s1_q AS (
  INSERT INTO onboarding_step_question (step_id, prompt, choices, answer_idx, explanation, expected_keywords, min_keywords)
  SELECT id, '🌏 Local Life Asia kết nối ai với ai?',
    ARRAY['Khách trải nghiệm ↔ cộng đồng địa phương','Hãng bay ↔ khách','Ngân hàng ↔ doanh nghiệp','Sàn TMĐT ↔ shop']::text[],
    0,
    'Đó là cốt lõi: cầu nối trải nghiệm văn hoá + kinh tế bản địa.',
    ARRAY[]::text[], 1
  FROM s1
  UNION ALL
  SELECT id, '💡 Khi sử dụng nền tảng, khách cần?',
    ARRAY['Tôn trọng cộng đồng + tuân thủ điều khoản','Trả tiền là xong','Không quan tâm điều khoản','Bí mật, không chia sẻ']::text[],
    0,
    'Tôn trọng cộng đồng địa phương là cốt lõi trải nghiệm tốt.',
    ARRAY[]::text[], 1
  FROM s1
)
INSERT INTO onboarding_assignment (flow_id, target_role, assigned_by)
SELECT id, 'guest', 'system@locallife.asia' FROM new_flow;

COMMIT;
