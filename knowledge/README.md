# Knowledge Base — Local Life Asia

Đây là **source of truth** của công ty. Mọi chính sách, quy trình, biểu mẫu,
tư liệu sản phẩm, thông tin đối tác đều nằm ở đây dưới dạng markdown với
YAML front-matter. AI chat nội bộ đọc trực tiếp thư mục này; DB chỉ cache
index phục vụ retrieval.

> **Nguyên tắc vàng:** nếu nó không nằm trong `knowledge/*.md`, AI không biết.
> Muốn AI trả lời được → viết doc.

## Cây thư mục (taxonomy 2 cấp: zone → dept)

Top-level folder = **plugin zone** — ai được truy cập content đó:

```
internal/          chỉ staff Local Life (employee/lead/admin)
  00-company/      Tầm nhìn, sứ mệnh, giá trị cốt lõi, org chart
  10-hr/
    onboarding/    Lộ trình 30-60-90, checklist nhân sự mới
    policies/      Nghỉ phép, chấm công, đánh giá, phúc lợi
    forms/         Biểu mẫu nội bộ
  20-operations/
    processes/     SOP: booking, hoàn tiền, escalation, tư vấn
    playbooks/     Xử lý khủng hoảng, incident
  30-product/
    homestay/      Tiêu chuẩn chất lượng homestay (góc nội bộ)
    experiences/   Tour trải nghiệm, kịch bản dẫn tour
    marketplace/   Sản phẩm OCOP, logistic
  40-partners/
    homestay-hosts/  Hồ sơ meta mỗi host
    artisans/      Hồ sơ nghệ nhân
    suppliers/     Hồ sơ nhà cung cấp
  50-finance/      [restricted] Pricing nội bộ, hợp đồng ký, tài khoản thanh toán

host/              host homestay/trải nghiệm tra cứu được (qua portal /host)
  onboarding/      Quy trình để host mới join platform
  standards/       Tiêu chí chất lượng nhìn từ góc host
  policies/        Hủy-hoàn-đổi, thưởng phạt áp dụng cho host
  faq/             Câu hỏi thường gặp của host

lok/               đối tác LOK tra cứu được (qua portal /lok)
  program/         Giới thiệu, quyền lợi, cam kết
  onboarding/      Đăng ký + xác nhận
  training/        Tài liệu đào tạo vận hành
  faq/             Câu hỏi thường gặp

public/            mọi user đã login xem được
  about/           Giới thiệu công ty public
  terms/           ToS, privacy, điều khoản công khai
  faq/             FAQ chung cho khách hàng
90-archive/       Bản cũ — giữ lại để tham chiếu, không hiển thị mặc định
```

Tiền tố số giúp sort ổn định; đừng rename khi đã có doc trỏ tới.

## Front-matter chuẩn

Mọi file `.md` **bắt buộc** mở đầu bằng block YAML:

```yaml
---
id: 01hm9xz5p0a2b4c7d8e9f0g1h2        # UUID/ULID bất biến, không đổi
title: "Quy trình onboarding host homestay"
owner: ops@locallife.asia              # email chịu trách nhiệm nội dung
audience: [employee]                    # employee | lead | admin (list)
sensitivity: internal                   # public | internal | restricted
tags: [onboarding, homestay, partner]
source:
  - type: manual                        # manual | pdf | drive | scan
    path: raw/ops/host-onboarding-v2.pdf   # nếu import từ raw, trỏ tới file gốc R2
    captured_at: 2026-04-01
last_reviewed: 2026-04-15               # ngày review gần nhất (YYYY-MM-DD)
reviewer: huy@locallife.asia
status: approved                        # draft | approved | deprecated
related: []                             # list id các doc liên quan
---
```

### Quy ước field

| Field          | Bắt buộc | Ghi chú                                                      |
|----------------|----------|--------------------------------------------------------------|
| `id`           | ✅       | ULID hoặc UUIDv7; sinh 1 lần, không bao giờ đổi              |
| `title`        | ✅       | Tên doc tiếng Việt có dấu                                    |
| `owner`        | ✅       | Email — người phải duyệt mọi thay đổi                        |
| `audience`     | ✅       | Danh sách role được phép **đọc**                             |
| `sensitivity`  | ✅       | `public` = có thể share ngoài; `internal` = trong công ty; `restricted` = hạn chế |
| `tags`         | ✅       | 2-6 tag tiếng Anh, viết thường, gạch nối                     |
| `last_reviewed`| ✅       | Re-review tối đa mỗi 90 ngày; bot sẽ flag doc quá hạn        |
| `status`       | ✅       | `deprecated` → ẩn khỏi retrieval, giữ lại cho audit          |
| `source`       | khi có   | Bắt buộc khi doc sinh từ pipeline ingestion                  |
| `related`      | optional | Cross-ref theo `id`, không theo path (path có thể đổi)       |

### Sensitivity × Audience (ví dụ)

- Biểu mẫu đăng ký nghỉ phép: `public`, `[employee, lead, admin]`
- Chính sách lương: `internal`, `[employee, lead, admin]`
- Hợp đồng với đối tác lớn: `restricted`, `[lead, admin]`
- Cơ cấu chi phí nội bộ: `restricted`, `[admin]`

AI enforce quyền **ở tầng tool**, không phải prompt. Filter chạy trước khi
tài liệu vào context.

## Viết nội dung

- Tiêu đề H1 trùng với `title` trong front-matter
- Dùng H2/H3 chia section; retrieval chunk theo heading
- Câu ngắn, tiếng Việt rõ ràng; tránh từ viết tắt chưa giải thích
- Liên kết doc khác bằng `[tên](../path/doc.md#heading)` + thêm `id` vào `related`
- Biểu mẫu: mô tả trong markdown + link tải bản gốc (`raw/...` trên R2)

## Lifecycle

```
draft → approved → (review định kỳ) → approved …
                                    ↘ deprecated (chuyển sang 90-archive/)
```

- PR từ AI (`draft_update` tool) luôn tạo doc/diff ở trạng thái `status: draft`
- Owner review → đổi sang `approved` + cập nhật `last_reviewed`
- Bot nightly: doc `approved` + `last_reviewed` > 90 ngày → mention owner

## Không cho vào đây

- Dữ liệu cá nhân khách hàng (PII) → xử lý ở hệ thống khác
- Mật khẩu, API key, secret → dùng secret manager
- File nhị phân lớn (PDF > 2MB, ảnh, video) → upload lên R2, link từ markdown

## Bắt đầu viết

Xem ví dụ mẫu trong mỗi thư mục. Template nhanh:

```bash
pnpm knowledge:new "Tiêu đề doc"  # script sinh stub (Phase 1)
```

Trước khi có script, copy một doc mẫu gần giống → sinh `id` mới
(https://www.ulidtools.com/) → cập nhật front-matter → viết nội dung.
