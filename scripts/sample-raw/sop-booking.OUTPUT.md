---
id: 01KPTMSS7ZM76CRX96FMDNATFS
title: "Quy trình nhận booking và xác nhận"
owner: ops@locallife.asia
audience: [employee, lead, admin]
sensitivity: internal
tags: [sop, booking, operations, homestay, refund]
source:
  - type: manual
    path: scripts/sample-raw/sop-booking.txt
    captured_at: 2026-04-22
last_reviewed: 2026-04-22
reviewer: ops@locallife.asia
status: draft
related: []
---
# Quy trình nhận booking và xác nhận

## 1. Tiếp nhận

Booking đến từ 3 nguồn:
- Website Local Life Asia (API tự động)
- Điện thoại / Zalo (nhân viên CS nhập tay)
- Đối tác giới thiệu (email, nhân viên CS nhập tay)

Mọi booking đều được gán mã LL-YYYYMMDD-XXXX ngay khi tiếp nhận.

## 2. Kiểm tra tính khả dụng

### Bước 2.1 — Trong vòng 30 phút kể từ khi nhận:

- Kiểm tra lịch trống của homestay/trải nghiệm trên hệ thống
- Nếu trống: chuyển bước 3
- Nếu không trống: gợi ý 2-3 option thay thế cùng khu vực, cùng hạng giá

### Bước 2.2 — Xác nhận với host:

- Gọi/nhắn host xác nhận (không chỉ dựa hệ thống, vì host có thể quên
  cập nhật)
- Deadline xác nhận từ host: 2 giờ. Quá hạn gọi lại.

## 3. Xác nhận với khách

Sau khi host confirm:
- Gửi email/SMS xác nhận kèm mã booking
- Gửi link thanh toán (nếu chưa thanh toán)
- Gửi thông tin liên hệ host + hướng dẫn đường đi

## 4. Trường hợp đặc biệt

- Booking trong vòng 24h (last-minute): duyệt qua lead ops trước khi confirm
- Booking nhóm >10 người: tạo kế hoạch riêng, có hợp đồng nhóm
- Booking quốc tế: kiểm tra visa, thời gian bay, múi giờ

## 5. Escalate

Nếu không xử lý được trong 2 giờ, escalate lên lead ops.
Nếu host không phản hồi trong 4 giờ, tìm homestay thay thế (xem SOP
hoàn tiền và đổi booking).
