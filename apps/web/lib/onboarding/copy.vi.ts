/**
 * Microcopy pool — tone công ty Local Life: thân tình, không sáo rỗng,
 * không nhãn-hàng. Sửa file này = sửa tone — founder review trước khi merge.
 */

export const MOTIVATION_LINES: string[] = [
  "Chào buổi sáng anh/chị! Hôm nay mình đi cùng nhau nhé.",
  "Một chút năng lượng giữa giờ — anh/chị đang làm tốt lắm.",
  "Khoảng 10 phút nghỉ tay sẽ giúp đầu óc rõ hơn nhiều đấy.",
  "Cảm ơn anh/chị vì những gì đang làm cho cộng đồng địa phương.",
  "Việc nhỏ làm tử tế cũng đủ tạo khác biệt — cứ tin vậy.",
  "Hôm nay không cần hoàn hảo, chỉ cần tiến lên một chút.",
  "Nếu mệt thì nghỉ — không ai chấm điểm anh/chị vì điều đó.",
  "Một câu hỏi đúng đáng giá hơn mười câu trả lời vội.",
  "Anh/chị đang được nhớ đến — bởi đồng nghiệp, bởi bà con.",
  "Nhịp chậm cũng là nhịp — miễn là không dừng.",
  "Đố anh/chị: hôm nay có 1 việc nhỏ làm rồi? (chỉ cần nhớ 1 cũng được)",
  "Khi rối, hỏi ngay — đừng tự chịu một mình.",
  "Mục tiêu hôm nay không cần lớn, cần rõ.",
  "Cộng đồng mạnh là vì có anh/chị trong đó.",
  "Một ngày làm tốt một việc cũng đã là tử tế lắm rồi.",
];

export const CHECK_IN_LINES: string[] = [
  "Anh/chị đang xử lý việc gì? Có chỗ nào cần em hỗ trợ không?",
  "Việc hiện tại có blocker gì cụ thể không? Em ghi lại giúp.",
  "Trong 30 phút tới, anh/chị định làm gì?",
  "Có việc nào bị treo lâu rồi không? Mình gỡ cùng nhau nhé.",
  "Hôm nay có gì làm anh/chị thấy hơi đuối không?",
  "Câu hỏi nhanh: tuần này anh/chị tự đánh giá tập trung mức nào (1-5)?",
  "Có doc / quy trình nào đang khó tìm khiến chậm việc không?",
  "Anh/chị muốn tuần sau ưu tiên học gì thêm?",
  "Có ai trong team cần hỗ trợ mà mình thấy được không?",
  "Việc nào hôm qua làm xong khiến anh/chị thấy nhẹ nhõm nhất?",
];

/**
 * Humor: câu đố vui ngắn, 4 phương án; "correct" lưu server-side.
 * KHÔNG có nội dung nhạy cảm (chính trị / tôn giáo / sắc tộc / giới).
 */
export interface HumorQuestion {
  q: string;
  options: { A: string; B: string; C: string; D: string };
  correct: "A" | "B" | "C" | "D";
}

export const HUMOR_BANK: HumorQuestion[] = [
  {
    q: "Đặc sản Đà Nẵng nào không phải hải sản?",
    options: {
      A: "Mì Quảng",
      B: "Bún chả cá",
      C: "Cao lầu",
      D: "Bánh tráng cuốn thịt heo",
    },
    correct: "A",
  },
  {
    q: "Một host LocalLife homestay khoá cửa nhầm trong WC. Cách nào ƯU TIÊN?",
    options: {
      A: "Đập cửa",
      B: "Gọi dịch vụ khoá",
      C: "Hỏi guest đang ăn sáng có biết mật mã không",
      D: "Trèo cửa sổ",
    },
    correct: "B",
  },
  {
    q: "Nếu phải chọn 1 thứ mang đi du lịch, chọn cái nào hữu dụng nhất?",
    options: {
      A: "Sạc dự phòng",
      B: "Kem chống nắng",
      C: "Khăn mỏng nhanh khô",
      D: "Phong ba bốn mùa",
    },
    correct: "C",
  },
  {
    q: "Một local đi tour kêu mệt — phản ứng đầu tiên của hướng dẫn viên?",
    options: {
      A: "Bảo cố lên",
      B: "Hỏi mệt vì sao",
      C: "Đổi điểm dừng gần",
      D: "Cho nghỉ + quan sát",
    },
    correct: "D",
  },
  {
    q: "Chữ '我' trong tiếng Trung có nghĩa là?",
    options: { A: "Mình", B: "Bạn", C: "Họ", D: "Chúng ta" },
    correct: "A",
  },
  {
    q: "Từ 'sustainable' tiếng Việt thường dịch là?",
    options: { A: "Bền vững", B: "Hiệu quả", C: "Liên tục", D: "Bảo tồn" },
    correct: "A",
  },
  {
    q: "Ở Hội An có món bánh nào thường ăn 3 thứ chung 1 dĩa?",
    options: { A: "Bánh tráng", B: "Bánh đập", C: "Bánh mì", D: "Bánh ướt" },
    correct: "B",
  },
  {
    q: "Mệnh đề nào THIẾU trong giá trị #1 của LocalLife?",
    options: {
      A: "Tử tế",
      B: "Trung thực",
      C: "Bền vững",
      D: "Cộng đồng đầu tiên",
    },
    correct: "D",
  },
];

export const POSITIVE_DASHBOARD_COPY = {
  streak1: "Bắt đầu rồi nhé!",
  streak3: "3 tuần đều đặn — đẹp lắm!",
  streak5: "5 tuần liên tiếp — ổn định quá!",
  streak10: "10 tuần — thành thói quen rồi đó.",
  lowFocus:
    "Tuần này anh/chị có vẻ bận. Cần em hỗ trợ gì không? (Nói với manager 1-1 cũng OK nha.)",
  midFocus: "Tuần này tạm ổn. Tuần sau mình giữ nhịp nhé.",
  highFocus: "Đỉnh cao tuần này. Anh/chị cứ giữ nhịp đó thôi!",
};

export function pickRandom<T>(pool: T[], rng: () => number = Math.random): T {
  if (pool.length === 0) {
    throw new Error("Pool rỗng — không pick được");
  }
  return pool[Math.floor(rng() * pool.length)];
}
