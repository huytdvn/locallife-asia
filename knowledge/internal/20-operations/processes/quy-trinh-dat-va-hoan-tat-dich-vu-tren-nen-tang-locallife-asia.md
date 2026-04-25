---
id: 01KPYXA2MHXTG9BV4ZHMVPRY2G
title: Quy trình đặt và hoàn tất dịch vụ trên nền tảng LocalLife.asia
owner: ops@locallife.asia
audience:
- employee
- lead
- admin
sensitivity: internal
tags:
- booking_process
- customer_flow
- host_actions
- host_confirmation
- payment_workflow
- platform_operations
- service_completion
- service_platform
source:
- type: image
  path: raw-ulid/01KPYX5RWYPRHEN24R5QZ205ZR.png
  captured_at: '2026-04-24'
last_reviewed: '2026-04-24'
reviewer: ops@locallife.asia
status: deprecated
related: []
---

# QUY TRÌNH ĐẶT DỊCH VỤ

## Bước 1: Khách đặt dịch vụ
* Khách truy cập nền tảng LocalLife.asia
* Chọn dịch vụ
    * Lưu trú
    * Trải nghiệm
    * Dịch vụ
* Điền thông tin
    * Ngày – giờ sử dụng
    * Số lượng người
    * Thông tin liên hệ & yêu cầu đặc biệt
* Nhấn “Đặt dịch vụ”

## Bước 2: Khách thanh toán trước 100%
* Chuyển đến giao diện thanh toán
* Hình thức thanh toán
    * Ví điện tử (Momo, ZaloPay, ...)
    * Chuyển khoản ngân hàng
    * Thẻ quốc tế (nếu hỗ trợ)
* Lưu ý
    * Giữ tiền trong “ví nền tảng”
    * Tạo mã Booking #ID

## Bước 3: Gửi thông báo đến Host
* Sau thanh toán thành công
    * Thông báo cho Host qua hệ thống, zalo hoặc email
    * Trạng thái booking: “Đã thanh toán – Chờ xác nhận từ Host”

## Bước 4: Host xác nhận dịch vụ
* Host đăng nhập vào nền tảng
* Kiểm tra đơn đặt
* Lựa chọn
    * ✅ Xác nhận booking
    * ❌ Từ chối (nêu lý do)
* Kết quả
    * ✅ Trạng thái “Sẵn sàng phục vụ”
    * ❌ Phương án thay thế/ Hoàn tiền cho khách

## Bước 5: Thực hiện dịch vụ
* Ngày hẹn
    * Khách đến trải nghiệm dịch vụ
* Host cung cấp dịch vụ
* Sau khi kết thúc
    * Đánh dấu “Đã hoàn thành”
    * Nếu không có khiếu nại sau 24h, tự động hoàn tất

## Bước 6: Ghi nhận doanh thu vào ví Host
* Khi dịch vụ “Hoàn tất”
    * Ghi nhận số tiền vào ví nội bộ của Host
* Trạng thái tiền
    * “Có thể rút”
* Lưu ý
    * Tiền giữ trong tài khoản nền tảng

## Bước 7: Host gửi yêu cầu rút tiền
* Vào mục “Ví của tôi”
* Chọn số tiền muốn rút
* Nhập thông tin nhận tiền
    * Số tài khoản ngân hàng
    * Tên chủ tài khoản
* Trạng thái
    * “Chờ duyệt rút tiền”

## Bước 8: Nền tảng duyệt yêu cầu rút tiền
* Quản trị viên kiểm tra
    * Booking đã hoàn tất
    * Không có tranh chấp
    * Thời gian giữ tiền an toàn
* Kết quả
    * Hợp lệ: Duyệt và chuyển khoản
    * Không hợp lệ: Từ chối và thông báo lý do

## Bước 9: Gửi thông báo & cập nhật hệ thống
* Thông báo cho Host
    * Giao dịch thành công
    * Biên nhận/hóa đơn (nếu có)
* Hệ thống ghi lại
    * Lịch sử booking
    * Lịch sử giao dịch rút tiền

## Bước 10: Đánh giá dịch vụ
* Khách đánh giá Host
    * 1-5 sao + bình luận
* Ảnh hưởng
    * Điểm uy tín
    * Ưu tiên hiển thị dịch vụ

> **Deprecated** — 2026-04-24: Trùng với `inbox/01KPYX9NCVNZHHSZZDQE15BTEK-quy-trinh-dat-va-thanh-toan-dich-vu-tren-nen-tang-locallife-.md`. Giữ lại để trace lineage, ẩn khỏi retrieval.
