---
id: 01KPYX9NCVNZHHSZZDQE15BTEK
title: Quy trình đặt và thanh toán dịch vụ trên nền tảng LocalLife.asia
owner: ops@locallife.asia
audience:
- employee
- lead
- admin
sensitivity: internal
tags:
- booking_process
- host_confirmation
- payment_procedure
- revenue_distribution
- service_delivery
- withdrawal_request
source:
- type: docx
  path: raw-ulid/01KPYX5RWV5625HEZGRB1Q2ZWR.docx
  captured_at: '2026-04-24'
last_reviewed: '2026-04-24'
reviewer: ops@locallife.asia
status: draft
related: []
---

# Quy trình đặt và thanh toán dịch vụ trên nền tảng LocalLife.asia

## Bước 1: Khách đặt dịch vụ

Khách truy cập nền tảng LocalLife.asia.

Chọn một dịch vụ cụ thể: tour trải nghiệm, homestay, hoạt động cộng đồng,...

Điền thông tin:

-   Ngày – giờ sử dụng
-   Số lượng người
-   Thông tin liên hệ & yêu cầu đặc biệt (nếu có)

Nhấn "**Đặt dịch vụ**".

## Bước 2: Khách thanh toán trước 100%

Nền tảng chuyển khách đến giao diện thanh toán.

Khách thanh toán toàn bộ chi phí qua các hình thức:

-   Ví điện tử (Momo, ZaloPay,...)
-   Chuyển khoản ngân hàng
-   Thẻ quốc tế (nếu hỗ trợ)

> 🔒 **Lưu ý**:
> Nền tảng giữ toàn bộ số tiền trong "**ví nền tảng**" (doanh thu chưa phân phối).
> Hệ thống tạo mã **Booking #ID**.

## Bước 3: Gửi thông báo đến Host

Sau khi thanh toán thành công, hệ thống:

-   Gửi thông báo cho Host (qua app, web hoặc email) với thông tin chi tiết booking.
-   Booking có trạng thái: "**Đã thanh toán – Chờ xác nhận từ Host**".

## Bước 4: Host xác nhận dịch vụ

Host đăng nhập vào nền tảng → kiểm tra đơn đặt.

Host chọn:

-   ✅ **Xác nhận booking**
-   ❌ **Từ chối** (nêu lý do nếu có)

Kết quả:

| Trạng thái | Hành động tiếp theo |
| :--------- | :------------------ |
| ✅ Được xác nhận | Chuyển sang trạng thái: "**Sẵn sàng phục vụ**" |
| ❌ Bị từ chối | Hệ thống hoàn tiền cho khách qua cổng thanh toán ban đầu |

## Bước 5: Thực hiện dịch vụ

Đến ngày hẹn, khách đến trải nghiệm dịch vụ tại địa phương.

Host cung cấp dịch vụ theo cam kết.

Sau khi kết thúc:

-   Host hoặc hệ thống đánh dấu "**Đã hoàn thành**".
-   Nếu không có khiếu nại từ khách sau một khoảng thời gian nhất định (ví dụ: 24h), hệ thống tự động chuyển sang trạng thái hoàn tất.

## Bước 6: Ghi nhận doanh thu vào ví nội bộ của Host

Khi dịch vụ được đánh dấu “Hoàn tất”:

-   Số tiền tương ứng của booking sẽ được ghi nhận vào ví nội bộ của Host.
-   Trạng thái số tiền: "**Có thể rút**".

> 🔐 **Lưu ý**:
> Số tiền này chưa được chuyển khoản thực tế cho Host.
> Vẫn được giữ trong tài khoản của nền tảng cho đến khi Host thực hiện rút tiền.

## Bước 7: Host gửi yêu cầu rút tiền

Host vào mục “Ví của tôi”.

Chọn số tiền muốn rút (có thể theo từng booking hoặc toàn bộ số dư khả dụng).

Nhập thông tin nhận tiền:

-   Số tài khoản ngân hàng
-   Tên chủ tài khoản

Xác nhận gửi yêu cầu.

→ Trạng thái: "**Chờ duyệt rút tiền**".

## Bước 8: Nền tảng duyệt yêu cầu rút tiền

Quản trị viên nền tảng kiểm tra:

-   Booking đã hoàn tất hợp lệ.
-   Không có tranh chấp.
-   Đã qua thời gian giữ tiền an toàn (ví dụ: 24-48h).
-   Hạn mức/thời gian rút tiền.

Nếu hợp lệ:

-   Duyệt và tiến hành chuyển khoản cho Host.
-   Cập nhật trạng thái: "**Đã rút thành công**".

Nếu không hợp lệ:

-   Từ chối rút và thông báo lý do (thiếu thông tin, chưa đủ điều kiện,...).

## Bước 9: Gửi thông báo & cập nhật hệ thống

Gửi thông báo cho Host:

-   Giao dịch thành công
-   Biên nhận/hóa đơn (nếu có)

Hệ thống ghi lại:

-   Lịch sử booking
-   Lịch sử giao dịch rút tiền

## Bước 10: Đánh giá dịch vụ

Sau khi hoàn tất dịch vụ:

-   Khách được mời đánh giá Host (1–5 sao + bình luận).
-   Các đánh giá ảnh hưởng đến điểm uy tín và ưu tiên hiển thị dịch vụ.
