---
id: 01KPYXBKY6HHSSJTQZJ550AQ9G
title: Bảng phân tích chi tiết doanh thu và lợi nhuận booking
owner: ops@locallife.asia
audience:
- lead
- admin
sensitivity: restricted
tags:
- booking_analysis
- commission_structure
- profit_margin
- revenue_report
- voucher_details
source:
- type: xlsx
  path: raw-ulid/01KPYX5RZ68Z94HHTZZ15V5HS1.xlsx
  captured_at: '2026-04-24'
last_reviewed: '2026-04-24'
reviewer: ops@locallife.asia
status: draft
related: []
---

# Bảng phân tích chi tiết doanh thu và lợi nhuận booking

### Bảng 1

| **Trạng thái** | OLD | OLD | OLD | OLD | OLD | OLD | OLD | OLD | OLD | OLD | OLD | NEW | NEW | OLD | OLD | NEW | NEW | NEW | NEW | NEW | NEW | NEW | NEW | NEW | NEW | NEW | NEW | OLD | OLD | OLD | NEW | NEW | NEW | OLD | NEW | OLD | OLD | OLD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |  | **Quantity** | **Net Price** | **Total Net** | **List Price** | **Host Voucher** | **LOK Voucher** | **Platform Voucher** | **Affiliate Voucher** | **Affiliate Fee** | **LOK Fee** | **Agency Commission** | **LOK Mgmt Fee** | **Invoiced Revenue** | **Net Profit** | **Host Payout** | **KOL Actual Payout** |  |  |  | **Cancelled By** | **Agency Name & Tax ID** | **Influencing Party & Tax ID** | **Host Name & Tax ID** | **KOL Name & Tax ID** |  |  |  |
| **STT** | 1.0 | 2.0 | 3.0 | 4.0 | 5.0 | 6.0 | 7.0 | 8.0 | 9.0 | 10.0 | 11.0 | 12.0 | 13.0 | 14.0 | 15.0 | 16.0 | 17.0 | 18.0 | 19.0 | 20.0 | 21.0 | 22.0 | 23.0 | 24.0 | 25.0 | 26.0 | 27.0 | 28.0 | 29.0 | 30.0 | 31.0 | 32.0 | 33.0 | 34.0 | 35.0 | 36.0 | 37.0 | 38.0 |
| **Công thức** |  |  |  |  |  |  |  |  |  |  |  |  |  | 14 = 13 * 12 | 15 = 14*(1+TỶ LỆ % COMM) | 16 = 15* tỷ lệ voucher | 17 = 15* tỷ lệ voucher | 18 = 15* tỷ lệ voucher | 19 = 15* tỷ lệ voucher | 20 = 15* tỷ lệ comm | 21 = 15* tỷ lệ comm | 22 = 15* tỷ lệ comm | 23 = 15* tỷ lệ comm | 24 = 15-14-18-19 | 25 = 24-23-22-20 | 26 = 14-21 | 27 = 21+20-17 |  |  |  |  |  |  |  |  |  |  |  |
| **Name** | **Booking** | **Pay out date** | **confirmed date** | **Usage date** | **Cancelled date** | **product name** | **product type** | **name** | **phone** | **email** | **status** | **số lượng** | **Giá net/sp (đã gồm VAT và TNCN)** | **Tổng net** | **Tổng giá bán (trước voucher)** | **Voucher Host - Host trả** | **Voucher LOK (trong LOK Program)** | **Voucher Platform chung - Nền tảng trả** | **Voucher Platform tạo cho LOK - Nền tảng trả - Theo affiliate link** | **LOK nhận (Affiliate)** | **LOK nhận (LOK Program)** | **B2B - Agency Comm (3-5%)** | **CTY quản lý KOL (Ký HĐ 2%) - Trên mỗi booking có gán Bên tác động** | **Doanh thu xuất hóa đơn** | **Lợi nhuận thuần LLA** | **Host nhận (chưa hạch toán trừ TNCN với HKD)** | **LOK thực nhận (Chưa hạch toán trừ TNCN)** | **Payment method** | **Transaction ID** | **Confirmer** | **Người hủy** | **Agency name - MST** | **Bên tác động - MST** | **Host name - MST** | **LOK name - MST** | **Affiliate/LOK Program Name** | **Affiliate ID** | **LOK Revenue** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **VÍ DỤ** | BK001 | 2026-01-31 00:00:00 | 2026-01-30 00:00:00 | 2026-02-01 00:00:00 |  | Tour A - Trekking Bà Nà Hoang Sơ | Trekking | Khách Việt Nam | 905123456.0 | khach1@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 |  | 60000.0 |  |  | 0.0 | 240000 | 0.0 | 24000 | 200000 | 176000 | 760000 | 180000 | Momo | TXN001 | Admin |  | Travel 1 - 231 | Media 1 - 132123 | Host 1 - 238123 | Tarzan - 12312 |  |  |  |
| **VÍ DỤ** | BK002 | 2026-01-31 00:00:00 | 2026-01-29 00:00:00 | 2026-02-02 00:00:00 |  | Tour B - Xe Bus Cao Cấp Đà Nẵng-Hà Nội | Bus VIP | Khách Nước Ngoài | 905987654.0 | foreign@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 | 120000 |  |  |  | 36000 | 0.0 | 0.0 | 24000 | 200000 | 140000 | 880000 | 36000 | VNPay | TXN002 | Host |  | Travel 1 - 231 | Media 1 - 132124 | Host 1 - 238123 | Tarzan - 12313 | AFF001 | AFF001_ID |  |
| **VÍ DỤ** | BK003 | 2026-02-01 00:00:00 | 2026-01-31 00:00:00 | 2026-02-03 00:00:00 |  | Tour C - Check-in Secret Spot Sơn Trà | Check-in | Cty Agency 1 | 905111223.0 | group@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 |  |  |  | 60000 | 36000 | 0.0 | 36000 | 24000 | 140000 | 44000 | 1000000 | 36000 | Bank TF | TXN003 | Admin |  | Travel 1 - 231 | Media 1 - 132125 | Host 1 - 238123 | Tarzan - 12314 | AFF002 | AFF002_ID |  |
| **VÍ DỤ** | BK004 | 2026-02-01 00:00:00 | 2026-01-30 00:00:00 | 2026-02-04 00:00:00 |  | Tour D - Local Food KOL Experience | Food Local | Couple Đà Nẵng | 905333444.0 | couple@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 |  |  |  | 60000 | 36000 | 0.0 | 0.0 | 24000 | 140000 | 80000 | 1000000 | 36000 | Cash | TXN004 | Host |  | Travel 1 - 231 | Media 1 - 132126 | Host 1 - 238123 | Tarzan - 12315 | AFF003 | AFF003_ID |  |
| **VÍ DỤ** | BK005 | 2026-02-02 00:00:00 | 2026-02-01 00:00:00 | 2026-02-05 00:00:00 |  | Tour E - Combo 2 Ngày Trek+Bus | Combo | Cty Agency 2 | 905444555.0 | family@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 |  |  | 60000 |  | 0.0 | 0.0 | 36000 | 0.0 | 140000 | 104000 | 1000000 | 0 | ZaloPay | TXN005 | Admin |  | Travel 1 - 231 | Media 1 - 132127 | Host 1 - 238123 | Tarzan - 12316 | AFF004 | AFF004_ID |  |
| **VÍ DỤ** | BK006 | 2026-02-02 00:00:00 | 2026-01-31 00:00:00 | 2026-02-06 00:00:00 |  | Tour F - Night Tour Bà Mụ Secret | Night | Solo KOL | 905666777.0 | solo@locallife.asia | confirmed | 1.0 | 1000000.0 | 1000000 | 1200000 |  |  | 60000 |  | 0.0 | 0.0 | 0.0 | 0.0 | 140000 | 140000 | 1000000 | 0 | Credit Card | TXN006 | Host |  | Travel 1 - 231 | Media 1 - 132128 | Host 1 - 238123 | Tarzan - 12317 | AFF005 | AFF005_ID |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 0.2 | 0.1 | 0.05 | 0.05 | 0.05 | 0.03 | 0.2 | 0.03 | 0.02 |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | Public |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  | 6000000 | 7200000 | 1200000 |  |  |  |  |  |  |  | 960000 | 684000 |  |  |  |  |  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | 9.5 |  |  |  |  |  |  |  |  |  |  |  |  |  |
