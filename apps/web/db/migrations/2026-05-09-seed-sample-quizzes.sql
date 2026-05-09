-- Seed sample quizzes cho host/lok/public — để các role này có nội dung
-- ngay khi mới deploy, không phải đợi admin tạo. Idempotent qua title check.
--
-- Note: questions là JSONB; mỗi câu có id (7-char), prompt, choices[],
-- answer_idx, explanation. Format chuẩn dùng bởi training_quiz_attempt.
-- doc_paths trỏ về file md có sẵn trong knowledge/.

BEGIN;

-- Ensure 'system@locallife.asia' role tồn tại (required by training_quiz.created_by FK).
-- Disabled = true để không thể login bằng email này, chỉ dùng làm system marker.
INSERT INTO roles (email, role, disabled)
VALUES ('system@locallife.asia', 'admin', true)
ON CONFLICT (email) DO NOTHING;

-- HOST sample
INSERT INTO training_quiz
  (title, motto, intro, audience, doc_paths, questions, pass_threshold, format, created_by, status)
SELECT
  'Chào mừng Host mới · Quy trình cơ bản',
  'Bắt đầu hành trình host trên Local Life Asia 🏡',
  'Quiz nhanh giúp host nắm những điều cơ bản nhất về nền tảng và quy trình đăng ký lưu trú/trải nghiệm. Đọc tài liệu kèm theo trước khi trả lời nhé.',
  ARRAY['host']::text[],
  ARRAY[
    'host/onboarding/huong-dan-dang-ky-luu-tru-va-trai-nghiem-tren-locallife-asia.md',
    'host/faq/cau-hoi-thuong-gap-danh-cho-doi-tac.md'
  ]::text[],
  '[
    {"id":"hst001","prompt":"Local Life Asia chủ yếu kết nối điều gì?","choices":["Du lịch trải nghiệm bản địa","Bán vé máy bay","Cho thuê xe đường dài","Đặt phòng khách sạn 5 sao"],"answer_idx":0,"explanation":"Nền tảng tập trung vào du lịch trải nghiệm và kết nối cộng đồng địa phương."},
    {"id":"hst002","prompt":"Trước khi nhận khách, host nên làm gì đầu tiên?","choices":["Kiểm tra hồ sơ + xác nhận thông tin chỗ lưu trú","Yêu cầu khách thanh toán trước","Bỏ qua quy trình check-in","Tự tăng giá theo mùa"],"answer_idx":0,"explanation":"Hoàn thiện hồ sơ + xác nhận chuẩn xác thông tin là bước nền cho mọi booking."},
    {"id":"hst003","prompt":"Khi gặp sự cố cần hỗ trợ, host liên hệ qua đâu?","choices":["Kênh hỗ trợ Local Life Asia","Tự xử lý không báo","Đăng lên mạng xã hội","Đợi khách phản hồi rồi mới làm"],"answer_idx":0,"explanation":"Đội hỗ trợ luôn sẵn sàng — báo sớm để được giải quyết kịp thời."}
  ]'::jsonb,
  70, 'quiz', 'system@locallife.asia', 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM training_quiz WHERE title = 'Chào mừng Host mới · Quy trình cơ bản'
);

-- LOK sample
INSERT INTO training_quiz
  (title, motto, intro, audience, doc_paths, questions, pass_threshold, format, created_by, status)
SELECT
  'Chào mừng LOK · Đại sứ du lịch bản địa',
  'Trở thành tiếng nói địa phương đáng tin cậy 🌟',
  'Bài kiểm tra ngắn dành cho cộng tác viên LOK mới. Đọc qua tài liệu hướng dẫn rồi trả lời các câu hỏi cơ bản về vai trò và chương trình.',
  ARRAY['lok']::text[],
  ARRAY[
    'lok/onboarding/onboarding-dai-su-du-lich-ban-dia-lok.md',
    'lok/program/gioi-thieu-chuong-trinh-local-life-asia.md'
  ]::text[],
  '[
    {"id":"lok001","prompt":"LOK viết tắt của khái niệm nào?","choices":["Local Opinions / KOL-KOC","Local Online Knowledge","Long Online Kit","Logistics Online Keeper"],"answer_idx":0,"explanation":"LOK là chương trình cộng tác viên tiếng nói bản địa, KOL-KOC địa phương."},
    {"id":"lok002","prompt":"Vai trò chính của một LOK là gì?","choices":["Giới thiệu trải nghiệm bản địa chân thực","Bán hàng đa cấp","Viết review thuê quảng cáo","Quản lý booking khách sạn"],"answer_idx":0,"explanation":"LOK chia sẻ trải nghiệm thật để cộng đồng tin tưởng nền tảng."},
    {"id":"lok003","prompt":"Khi đăng nội dung có gắn trải nghiệm Local Life, LOK cần?","choices":["Giữ trung thực + tuân thủ điều khoản chương trình","Chỉ khen, tránh nhược điểm","Sao chép từ host","Đăng nặc danh"],"answer_idx":0,"explanation":"Nội dung trung thực + tuân thủ điều khoản là nền tảng uy tín dài hạn."}
  ]'::jsonb,
  70, 'quiz', 'system@locallife.asia', 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM training_quiz WHERE title = 'Chào mừng LOK · Đại sứ du lịch bản địa'
);

-- PUBLIC (guest) sample
INSERT INTO training_quiz
  (title, motto, intro, audience, doc_paths, questions, pass_threshold, format, created_by, status)
SELECT
  'Local Life Asia là gì? · Câu hỏi nhanh',
  'Một phút hiểu nền tảng 🌏',
  'Quiz cực ngắn cho khách public — tìm hiểu Local Life Asia là gì, hoạt động ra sao. Đọc trang giới thiệu trước khi trả lời.',
  ARRAY['guest']::text[],
  ARRAY[
    'public/about/gioi-thieu-local-life-asia-nen-tang-du-lich-ben-vung.md',
    'public/terms/dieu-khoan-va-dieu-kien-su-dung-nen-tang-locallife-asia.md'
  ]::text[],
  '[
    {"id":"pub001","prompt":"Local Life Asia là nền tảng kết nối ai với ai?","choices":["Cộng đồng địa phương ↔ khách trải nghiệm","Ngân hàng ↔ doanh nghiệp","Sàn TMĐT ↔ shop","Studio ↔ MC"],"answer_idx":0,"explanation":"LLA cầu nối giữa cộng đồng địa phương và những người muốn trải nghiệm văn hoá bản địa."},
    {"id":"pub002","prompt":"Khi sử dụng nền tảng, khách cần tuân thủ điều gì?","choices":["Điều khoản sử dụng + tôn trọng cộng đồng địa phương","Không có điều khoản","Bí mật, không chia sẻ","Chỉ trả tiền là xong"],"answer_idx":0,"explanation":"Tôn trọng cộng đồng địa phương là cốt lõi của nền tảng — đọc kỹ điều khoản trước khi đặt."}
  ]'::jsonb,
  70, 'quiz', 'system@locallife.asia', 'published'
WHERE NOT EXISTS (
  SELECT 1 FROM training_quiz WHERE title = 'Local Life Asia là gì? · Câu hỏi nhanh'
);

COMMIT;
