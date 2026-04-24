---
id: 01HM9A20OPSPROCESS0REFUND0001
title: 'SOP: Hoàn tiền và đổi booking'
owner: ops@locallife.asia
audience:
- employee
- lead
- admin
sensitivity: internal
tags:
- sop
- refund
- booking
- customer-service
last_reviewed: 2026-04-14
reviewer: ops@locallife.asia
status: approved
related:
- 01HM9A20OPSPROCESS0HOSTONBOAR
---

# SOP: Hoàn tiền và đổi booking

Áp dụng cho mọi booking qua Local Life Asia, trừ khi host có chính sách riêng ghi rõ trên listing.

## Nguyên tắc chung

1.  **Quyết trong 24 giờ** từ lúc khách yêu cầu.
2.  **Lỗi thuộc về ai thì người đó chịu chi phí**: Local Life, host, hay khách.
3.  **Nếu không rõ lỗi** → Local Life hoàn 100%, chịu chi phí, sau đó điều tra nội bộ.
    > Giữ niềm tin khách trước, tiền sau.

## Bảng quyết định

| Tình huống                              | Trước 48h | 24-48h | < 24h | Sau check-in   |
| :-------------------------------------- | :-------- | :----- | :---- | :------------- |
| Khách huỷ (lý do cá nhân)               | Hoàn 100% | 50%    | 0%    | 0%             |
| Khách huỷ (ốm, có giấy)                 | 100%      | 100%   | 80%   | Theo tình huống |
| Host huỷ                                | 100% + voucher 20% cho lần sau |||||
| Thiên tai / bất khả kháng               | 100% không phí, host không phạt |||||
| Homestay không đúng mô tả               | 100% + tìm homestay thay + voucher 30% |||||
| Khách bỏ về giữa chừng (lỗi homestay)   | Hoàn phần chưa ở + chi phí homestay thay |||||
| Khách bỏ về giữa chừng (lỗi khách)      | Không hoàn |||||

## Quy trình

### Bước 1 — Ghi nhận (0-2 giờ)

CS (nhân viên chăm sóc khách) trả lời trong 2 giờ kể từ khi nhận yêu cầu.
Hỏi tối thiểu:
-   **Mã booking**.
-   **Lý do** (ngắn gọn).
-   **Bằng chứng** nếu có (ảnh, video, giấy khám).
-   **Mong muốn**: hoàn 100% / một phần / đổi homestay / đổi ngày.

### Bước 2 — Phân loại (2-12 giờ)

CS tra bảng quyết định → đa số case tự xử lý được.
**Escalate lên Lead Ops** nếu:
-   Giá trị hoàn > 5 triệu VND.
-   Có tranh cãi ai có lỗi.
-   Host từ chối phương án đề xuất.

### Bước 3 — Xử lý (12-24 giờ)

-   Hoàn tiền qua đúng kênh thanh toán gốc (trừ khi khách yêu cầu khác + xác minh).
-   Nếu đổi homestay: CS book trực tiếp, không bắt khách book lại.
-   Gửi email xác nhận + timeline hoàn tiền (cổng thanh toán 3-7 ngày làm việc).

### Bước 4 — Ghi nhận bài học (sau đó)

-   Mọi case hoàn tiền > 2 triệu VND phải viết 3-5 dòng vào audit log.
-   Hàng tháng Lead Ops review top 10 case, rút ra pattern → cập nhật SOP hoặc [tiêu chuẩn homestay](../../30-product/homestay/homestay-standards.md).

## Công cụ CS dùng

AI chat nội bộ hỗ trợ:
-   *"Booking ABC123 xin huỷ trước 36 giờ, host, vì..."* → AI gợi ý phương án theo bảng quyết định, tạo draft email.
-   *"Trường hợp này có giống case nào trước không?"* → AI tìm trong audit log.
> AI **không tự xử lý hoàn tiền** — luôn có CS xác nhận cuối cùng.
