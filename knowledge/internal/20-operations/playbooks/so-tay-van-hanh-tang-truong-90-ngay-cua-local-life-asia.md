---
id: 01KPYXBN5SPVHXWB7VN8845JAS
title: Sổ Tay Vận Hành & Tăng Trưởng 90 Ngày Của Local Life Asia
owner: ops@locallife.asia
audience:
- employee
- lead
- admin
sensitivity: internal
tags:
- ai agent setup
- ai_setup
- content marketing
- growth strategy
- growth_strategy
- host_acquisition
- influencer marketing
- marketing strategy
- marketing_strategy
- operational playbook
- operational_playbook
- system_setup
source:
- type: docx
  path: raw-ulid/01KPYX5RZ9DDSME7JX9KRBD79D.docx
  captured_at: '2026-04-24'
last_reviewed: '2026-04-24'
reviewer: ops@locallife.asia
status: draft
related: []
---

# Sổ Tay Vận Hành & Tăng Trưởng 90 Ngày Của Local Life Asia

Chiến lược Vận hành & Tăng trưởng 90 Ngày từ Setup hệ thống **AI Agent** đến 10.000 Users.

**Mục tiêu đầu ra sau 90 ngày:**

| 10.000 Users | 50 LOKs | 500 Hosts (Marketing) | 200 Hosts (LOKs) |
| :----------- | :------ | :-------------------- | :---------------- |
|              |         |                       |                   |

Version 1.0 — March 2026

## Mục lục

> Lưu ý: Cập nhật TOC bằng cách click chuột phải vào TOC trong Word > Update Field > Update Entire Table.

## PHẦN 1: SETUP HỆ THỐNG PAPERCLIP AI TRÊN MAC PRO

### 1.1 Chuẩn bị môi trường Mac

**Mac Pro** cần được cài đặt đầy đủ các công cụ phát triển trước khi triển khai **Paperclip AI**. Dưới đây là từng bước chi tiết:

Bước 1: Cài **Homebrew** & công cụ cơ bản

Mở **Terminal** trên **Mac** và chạy tuần tự các lệnh sau:

`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`

Sau khi **Homebrew** được cài xong, tiếp tục cài các dependency:

`brew install node git postgresql@16 python3 tmux`

Kiểm tra phiên bản **Node.js** (cần >= 18): `node --version`

Bước 2: Cài **Claude Code CLI**

**Claude Code** là công cụ dòng lệnh để các **agent AI** tương tác với code và hệ thống:

`npm install -g @anthropic-ai/claude-code`

Xác thực với **Anthropic API** bằng cách chạy: `claude auth login`

Nếu dùng **Claude Pro** (claude.ai), cấu hình trong `~/.claude/settings.json` để sử dụng OAuth thay vì **API key** riêng.

Bước 3: Cài đặt **PostgreSQL**

Khởi động **PostgreSQL** và tạo **database** cho **Paperclip AI**:

`brew services start postgresql@16`

`createdb paperclip_dev`

> Quan trọng: Đảm bảo encoding **UTF-8** cho hỗ trợ tiếng Việt. Kiểm tra bằng lệnh: `psql -c "SHOW server_encoding;"` — kết quả phải là `UTF8`.

Bước 4: Clone và cấu hình **Paperclip AI**

`git clone https://github.com/paperclip-ai/paperclip.git && cd paperclip`

`npm install`

`cp .env.example .env` `# Sửa file .env với thông số của bạn`

Cấu hình file `.env` với các giá trị quan trọng:

`DATABASE_URL=postgresql://localhost:5432/paperclip_dev`

`ANTHROPIC_API_KEY=sk-ant-...` `(hoặc dùng OAuth nếu Claude Pro)`

`HOST=0.0.0.0` `(quan trọng nếu truy cập qua Tailscale)`

`PORT=3000`

Bước 5: Cấu hình 5 **Agent** cho **Local Life Asia**

Tạo thư mục `agents` và các file hướng dẫn cho từng **agent**:

`mkdir -p agents/{ceo,cto,marketing,hr,engineering}`

Bước 6: Cấu hình auto-approval & tmux

Tạo file `~/.claude/settings.json` với nội dung cho phép **agent** tự động thực thi mà không cần xác nhận thủ công.

Hoặc sử dụng flag `--dangerously-skip-permissions` khi khởi chạy **agent** trong môi trường phát triển.

Khởi chạy 5 **agent** trong các `tmux session` riêng biệt:

`tmux new-session -d -s ceo-agent 'cd agents/ceo && claude --dangerously-skip-permissions'`

`tmux new-session -d -s marketing-agent 'cd agents/marketing && claude --dangerously-skip-permissions'`

Lặp lại cho các **agent** còn lại (**cto**, **hr**, **engineering**).

Bước 7: Cấu hình **Tailscale** cho truy cập từ xa

Cài **Tailscale** để truy cập **Mac Pro** từ bất kỳ đâu:

`brew install tailscale && tailscale up`

Đảm bảo `HOST=0.0.0.0` trong `.env` để **Paperclip AI** lắng nghe trên tất cả các interface, bao gồm **Tailscale VPN interface**.

Từ máy khác (laptop, điện thoại), kết nối **SSH**: `ssh user@<tailscale-ip>` và dùng **Cursor Remote-SSH** để code trực tiếp.

## PHẦN 2: CHIẾN LƯỢC TĂNG TRƯỞNG 90 NGÀY

### 2.1 Tổng quan mục tiêu & Timeline

### 2.2 Phân bổ ngân sách dự kiến (90 ngày)

## PHẦN 3: CHIẾN LƯỢC MARKETING CHI TIẾT

### 3.1 Kênh Paid Ads — Kéo 500 Hosts qua Marketing

#### 3.1.1 Facebook & Instagram Ads

Mục tiêu: Tạo nhận diện thương hiệu với du khách quốc tế và thu hút **hosts** đăng ký.

-   **Campaign 1 — Tourist Awareness**: Nhắm expats, digital nomads, frequent travelers đến Việt Nam. Lookalike audience từ travel booking sites. Budget: 40% của **paid ads**.
-   **Campaign 2 — Host Recruitment**: Nhắm chủ homestay, tour guide, nhà hàng địa phương. Thông điệp: "Tăng doanh thu bằng cách số hóa trải nghiệm của bạn". Budget: 30% của **paid ads**.
-   **Campaign 3 — Retargeting**: Nhắm người đã visit website nhưng chưa đăng ký. Dynamic ads với điểm đến cụ thể. Budget: 30% của **paid ads**.

#### 3.1.2 Google Ads

-   **Search Ads**: Nhắm từ khóa "authentic Vietnam experience", "local tours Vietnam", "homestay Vietnam". Geo-target: US, EU, Australia, Singapore, Japan, Korea.
-   **Display Ads**: Banner trên các travel blog và forum phổ biến.
-   **YouTube Ads**: Video ngắn 15-30s giới thiệu trải nghiệm địa phương chân thực.

#### 3.1.3 TikTok Ads

**TikTok** là kênh chủ lực cho việc viral các trải nghiệm du lịch:

-   **Spark Ads**: Boost bài đăng của travel creators đã tag **Local Life Asia**.
-   **In-Feed Ads**: Video storytelling "Một ngày sống như người địa phương tại Hội An".
-   **Hashtag Challenge**: `#LocalLifeAsia` — Du khách chia sẻ trải nghiệm địa phương của họ.

### 3.2 Content Marketing & SEO

#### 3.2.1 Blog & Long-form Content

-   Xuất bản 3-5 bài/tuần trên blog với chuẩn **SEO**: "Top 10 Hidden Gems in Đà Nẵng", "How to Experience Authentic Vietnamese Street Food".
-   Guest posts trên travel blog lớn: Nomadic Matt, The Blonde Abroad, các travel subreddit.
-   Translate nội dung sang 5 ngôn ngữ: English, Japanese, Korean, Chinese, French.

#### 3.2.2 Social Media Organic

-   **Instagram**: Đăng 1 Reel/ngày với nội dung trải nghiệm địa phương. Sử dụng carousel cho "Before vs After" của các điểm đến.
-   **TikTok**: 2-3 video/ngày. Focus vào reaction của du khách, đồ ăn đường phố, cảnh đẹp ẩn.
-   **YouTube**: 1-2 video dài/tuần với format vlog. Hợp tác với các YouTuber du lịch.
-   **Pinterest**: Tạo boards cho từng thành phố/vùng miền, đánh **SEO** cho **Pinterest** search.

#### 3.2.3 Email Marketing

-   **Welcome Series** (5 emails): Giới thiệu nền tảng, highlight top experiences, testimonials, ưu đãi first booking.
-   **Weekly Newsletter**: "This Week in Local Life" — điểm đến mới, stories từ **LOKs**, deals.
-   **Host Onboarding Series**: Hướng dẫn số hóa, tips tối ưu listing, case studies thành công.

### 3.3 Influencer & Partnership

-   **Tier 1 — Mega Influencers** (100K+ followers): 2-3 hợp tác/tháng. Trả phí + commission per booking.
-   **Tier 2 — Micro Influencers** (10K-100K): 10-15/tháng. Chi phí thấp, engagement cao. Cung cấp trải nghiệm miễn phí đổi content.
-   **Tier 3 — Nano/UGC Creators** (1K-10K): Mời du khách tạo content đổi điểm thưởng trên nền tảng.
-   **Travel Agency Partnerships**: Liên kết với các công ty lữ hành nhỏ để cross-promote.
-   **Hotel/Hostel Partnerships**: Đặt **QR code** và brochure tại lobby của các khách sạn/hostel đối tác.

### 3.4 Virtual Influencer / KOL AI

Sử dụng công cụ **AI** để tạo **Virtual KOL** cho **Local Life Asia**:

-   **Midjourney**: Tạo hình ảnh nhân vật ảo đại diện (nhân vật nữ trẻ, phong cách backpacker chân thực).
-   **HeyGen**: Tạo video avatar nói đa ngôn ngữ giới thiệu điểm đến.
-   **LoRA fine-tuning**: Đào tạo model nhận diện nhân vật ảo nhất quán qua nhiều ảnh.
-   Post lịch đều đặn trên **Instagram**/**TikTok** như một travel creator thực sự.

## PHẦN 4: CHƯƠNG TRÌNH LOK (ĐẠI SỨ DU LỊCH ĐỊA PHƯƠNG)

### 4.1 LOK là ai?

**LOK (Local Life Ambassador)** là người địa phương am hiểu văn hóa, du lịch và có mạng lưới với các hộ kinh doanh tại địa bàn. **LOK** đóng vai trò cầu nối giữa nền tảng và các **hosts** địa phương.

**Chân dung LOK lý tưởng:**

-   Sinh viên du lịch, hướng dẫn viên tự do, người làm về truyền thông địa phương
-   Hiểu rõ văn hóa, ẩm thực, điểm đến đặc sắc của vùng
-   Có kỹ năng giao tiếp và sử dụng smartphone/mạng xã hội
-   Có mạng lưới với chủ homestay, nhà hàng, dịch vụ địa phương
-   Nhiệt huyết với việc quảng bá du lịch địa phương

### 4.2 Phân bổ LOK theo khu vực (50 LOKs)

### 4.3 Quy trình tuyển dụng LOK

**Giai đoạn 1: Tiếp cận & Thu hút**

-   Đăng tin tuyển dụng trên các group **Facebook** về du lịch địa phương, group sinh viên du lịch.
-   Liên hệ trực tiếp qua các hội hướng dẫn viên du lịch tại địa phương.
-   Chạy chiến dịch "Trở thành Đại sứ Du lịch" trên social media.
-   Partner với các trường đại học du lịch để tìm ứng viên.

**Giai đoạn 2: Sàng lọc & Phỏng vấn**

**Tiêu chí đánh giá LOK (thang điểm 1-5 cho mỗi tiêu chí):**

-   Kinh nghiệm du lịch địa phương
-   Kỹ năng giao tiếp
-   Sử dụng công nghệ
-   Mạng lưới địa phương
-   Nhiệt huyết

**Giai đoạn 3: Đào tạo (3 ngày)**

### 4.4 Cơ chế thu nhập LOK

## PHẦN 5: QUY TRÌNH SỐ HÓA HOST & QUẢN LÝ BOOKING

### 5.1 LOK hỗ trợ Host số hóa sản phẩm

**Quy trình 7 bước để LOK giúp host đưa sản phẩm/dịch vụ lên nền tảng:**

-   **Bước 1: Khảo sát và đánh giá sơ bộ**
    **LOK** đến thăm cơ sở, chụp ảnh hiện trạng, phỏng vấn chủ hộ kinh doanh về dịch vụ, giá cả, khả năng tiếp nhận khách. Điền form đánh giá sơ bộ trên **LOK Dashboard** với các tiêu chí:
    -   An toàn và vệ sinh cơ bản (bắt buộc đạt)
    -   Trải nghiệm đặc sắc địa phương (có gì khác biệt?)
    -   Khả năng giao tiếp với du khách quốc tế
    -   Sẵn sàng số hóa (có smartphone, sẵn lòng học app)
-   **Bước 2: Chụp ảnh & quay video chuyên nghiệp**
    **LOK** sử dụng smartphone chụp theo template chuẩn của nền tảng: tối thiểu 10 ảnh chất lượng cao (không gian, món ăn, hoạt động, cơ sở vật chất) + 1 video ngắn 30-60s giới thiệu trải nghiệm. Template hướng dẫn chụp ảnh được cung cấp trong **LOK Training Kit**.
-   **Bước 3: Tạo listing trên nền tảng**
    **LOK** tạo listing thay mặt **host** hoặc hướng dẫn **host** tự tạo:
    -   Tiêu đề hấp dẫn bằng 2 ngôn ngữ (Việt + Anh)
    -   Mô tả chi tiết: điểm đặc biệt, bao gồm gì, thời lượng, lưu ý
    -   Định giá cạnh tranh dựa trên khảo sát thị trường
    -   Chọn danh mục và tags phù hợp để **SEO** nội bộ
    -   Upload ảnh và video đã chụp
-   **Bước 4: Duyệt nội bộ bởi đội ngũ chất lượng**
    Mọi listing trước khi được publish phải qua 2 vòng kiểm duyệt: (1) **LOK Team Lead** kiểm tra nội dung, ảnh, giá cả; (2) **Quality Agent (AI)** kiểm tra tự động về đủ ảnh, mô tả, không vi phạm chính sách. Nếu không đạt, trả về **LOK** kèm feedback cụ thể.
-   **Bước 5: Hướng dẫn host nhận và xử lý booking**
    **LOK** hướng dẫn **host** sử dụng app để nhận thông báo **booking** mới, xác nhận/từ chối trong vòng 2 giờ, liên lạc với khách qua chat in-app, và cập nhật trạng thái sau khi hoàn thành dịch vụ.
-   **Bước 6: Follow-up sau 7 ngày**
    **LOK** quay lại kiểm tra: **host** có gặp khó khăn gì không? Có đơn **booking** nào? Cần tối ưu listing không? Thu thập feedback đầu tiên.
-   **Bước 7: Giám sát liên tục**
    **LOK** theo dõi **host** hàng tháng: kiểm tra điểm đánh giá từ khách, hỗ trợ cải thiện, báo cáo về trung tâm nếu chất lượng giảm.

### 5.2 Hệ thống điều phối Booking

Quy trình **booking end-to-end** trên nền tảng.

## PHẦN 6: KIỂM SOÁT CHẤT LƯỢNG & BẢO VỆ DU KHÁCH

### 6.1 Hệ thống đánh giá chất lượng 5 tầng

**Local Life Asia** áp dụng 5 tầng kiểm soát chất lượng để đảm bảo trải nghiệm tốt nhất cho du khách:

-   **Tầng 1: Kiểm duyệt đầu vào (Pre-listing)**
    -   **LOK** khảo sát thực địa 100% trước khi onboard
    -   Checklist bắt buộc: vệ sinh, an toàn, cơ sở vật chất, giấy phép kinh doanh
    -   **AI Quality Agent** kiểm tra tự động: ảnh chất lượng, mô tả đầy đủ, giá hợp lý
    -   Phê duyệt 2 cấp: **LOK Lead** + **Platform Quality Team**
-   **Tầng 2: Giám sát thực tế (During experience)**
    -   Check-in **QR code** xác nhận du khách đã đến
    -   **LOK** kiểm tra đột xuất (**mystery guest**) 1-2 lần/tháng cho mỗi **host**
    -   Hệ thống cảnh báo thời gian thực nếu **host** không check-in khách
-   **Tầng 3: Đánh giá sau trải nghiệm (Post-experience)**
    -   Thu thập review từ du khách qua 3 kênh: (1) In-app rating 1-5 sao + text review (bắt buộc); (2) Survey chi tiết qua email 24h sau; (3) Social media mentions tracking.
    -   Hệ thống tự động flag nếu: rating dưới 3 sao, nhiều hơn 2 review tiêu cực liên tiếp, hoặc tỷ lệ hủy cao bất thường.
-   **Tầng 4: Đo lường và Scoring**
    Mỗi **host** có **Quality Score** từ 0-100, tính từ:
    -   Rating trung bình từ du khách (60%)
    -   Tỷ lệ hủy booking (15%)
    -   Tỷ lệ phản hồi nhanh (10%)
    -   Số lượt **LOK** kiểm tra đột xuất đạt (10%)
    -   Điểm hoàn thành checklist **LOK** ban đầu (5%)

    **Xếp hạng host dựa trên Quality Score:**

    | Điểm Quality Score | Xếp hạng host  |
    | :----------------- | :------------- |
    | 90-100             | **Super Host** |
    | 70-89              | Ưu tú          |
    | 50-69              | Đạt chuẩn      |
    | Dưới 50            | Cần cải thiện  |

-   **Tầng 5: Kiểm tra định kỳ (Quarterly Audit)**
    Mỗi quý, **LOK** thực hiện đánh giá lại toàn bộ **hosts** trên địa bàn: kiểm tra vệ sinh, cập nhật ảnh nếu có thay đổi, xác nhận giá cả và dịch vụ đúng như mô tả. Kết quả được cập nhật vào **Quality Score**.

### 6.2 Chính sách Bảo vệ Du khách

#### 6.2.1 Bảo đảm hoàn tiền (**Money-Back Guarantee**)

Du khách được hoàn tiền 100% trong các trường hợp:

-   **Host** hủy **booking** mà không có lý do chính đáng (hoàn 100% + tặng voucher 10%)
-   Trải nghiệm không đúng như mô tả (hoàn 50-100% tùy mức độ sai lệch)
-   Vấn đề an toàn hoặc vệ sinh nghiêm trọng (hoàn 100% + bồi thường)
-   **Host** không xuất hiện (hoàn 100% + đặt lại miễn phí trải nghiệm tương đương)

#### 6.2.2 Hệ thống giải quyết khiếu nại

#### 6.2.3 Bảo hiểm trải nghiệm

Mọi **booking** trên **Local Life Asia** bao gồm "**Experience Protection**" miễn phí, cover các rủi ro cơ bản trong quá trình trải nghiệm. Với các hoạt động mạo hiểm (trekking, lặn biển...), nền tảng yêu cầu **host** phải có bảo hiểm trách nhiệm dân sự và du khách được khuyến nghị mua bảo hiểm du lịch riêng.

#### 6.2.4 Chính sách minh bạch

-   Hiển thị rõ ràng: giá đã bao gồm gì, chưa bao gồm gì, chi phí phát sinh có thể xảy ra.
-   Reviews chỉ từ người đã thực sự **booking** và hoàn thành trải nghiệm (**verified reviews**).
-   **Host** không thể xóa hoặc ẩn review tiêu cực.
-   Thông tin giấy phép kinh doanh của **host** được xác minh và hiển thị badge "**Verified Business**".
-   Chính sách hủy rõ ràng: Miễn phí hủy trước 48h, phí 50% nếu hủy trong 24-48h, không hoàn nếu hủy dưới 24h.

## PHẦN 7: HỆ THỐNG AFFILIATE & ĐO LƯỜNG

### 7.1 Cơ chế Affiliate cho LOKs và Partners

Hệ thống **affiliate** được tích hợp vào module đo lường sẵn có của nền tảng:

#### 7.1.1 LOK Affiliate

-   Mỗi **LOK** có link giới thiệu riêng: `locallife.asia/ref/LOK-[mã]`
-   Hoa hồng 3% từ mọi **booking** qua link giới thiệu (ngoài hoa hồng 5% từ **hosts** đã onboard)
-   **Dashboard** thống kê real-time: clicks, conversions, doanh thu, hoa hồng
-   Thanh toán hoa hồng tự động vào ngày 1 và 15 hàng tháng

#### 7.1.2 Partner Affiliate (Travel Bloggers, Agencies)

-   Chương trình mở cho bất kỳ ai muốn giới thiệu **Local Life Asia**
-   Hoa hồng 5% cho mọi **booking** thành công qua link **affiliate**
-   Cấp bậc **affiliate**: Bronze (0-10 bookings/tháng, 5%), Silver (11-50, 7%), Gold (51+, 10%)
-   Cung cấp banner, widget, deep links cho từng điểm đến cụ thể

### 7.2 Hệ thống đo lường KPI

Module đo lường tracking toàn bộ hoạt động của nền tảng:

**KPI cho CEO Agent giám sát hàng tuần:**

-   Số lượng **hosts** mới onboard
-   Số lượng **booking** thành công
-   Tổng doanh thu (**GMV**)
-   Tỷ lệ hủy **booking**
-   **Quality Score** trung bình của **hosts**
-   Chi phí vận hành **agent AI**

**KPI cho Marketing Agent:**

-   **User acquisition cost (CAC)**
-   **Return on Ad Spend (ROAS)**
-   **Website traffic** & **conversion rate**
-   **Social media engagement**
-   **Email open rate** & **CTR**

## PHẦN 8: PLAYBOOK TUẦN CHI TIẾT

### 8.1 Phase 1: Launch (Tuần 1-4)

-   **Tuần 1: Foundation**
    -   Setup **Paperclip AI** và 5 **Agents** trên **Mac Pro**
    -   Hoàn thiện website/app **Local Life Asia**
    -   Tuyển dụng và đào tạo 5 **LOK** đầu tiên tại Đà Nẵng, Hội An
    -   Launch **Facebook & Instagram Ads** Campaign 1 (Tourist Awareness)
    -   Mục tiêu: 10 **hosts** đầu tiên (qua **LOK**), 100 users
-   **Tuần 2: First Content & Hosts**
    -   5 **LOK** onboarding 25 **hosts** mới
    -   Đội **Content Marketing** xuất bản 5 bài blog, 7 **Instagram Reels**, 10 **TikTok** videos
    -   Launch **Google Ads** Search Ads
    -   Bắt đầu **Email Welcome Series**
    -   Mục tiêu: 35 **hosts** (30 qua **LOK**, 5 qua marketing), 500 users
-   **Tuần 3-4: Momentum**
    -   Tuyển thêm 10 **LOK** tại Hà Nội, TP.HCM
    -   Onboard 65 **hosts** mới (50 qua **LOK**, 15 qua marketing)
    -   Launch **Facebook & Instagram Ads** Campaign 2 (Host Recruitment)
    -   Hợp tác với 5 **micro influencers**
    -   Mục tiêu: 100 **hosts**, 1.000 users cuối tuần 4

### 8.2 Phase 2: Scale (Tuần 5-8)

-   Tăng budget **paid ads** lên gấp 2, focus vào các campaign có **ROAS** tốt nhất
-   Tuyển thêm 15 **LOK** tại các vùng mới (Sa Pa, Ninh Bình, Đà Lạt, Phú Quốc)
-   Mục tiêu: 150 **hosts** mới (80 qua marketing, 70 qua **LOK**)
-   Launch chương trình **Partner Affiliate** với 20 travel bloggers
-   Tổ chức 2 online events: "Meet Local Life" cho du khách và "Host Success Stories" cho **hosts**
-   Triển khai **Virtual KOL** trên **Instagram** và **TikTok** (3-5 posts/tuần)
-   Đạt 4.000 users cuối tuần 8

### 8.3 Phase 3: Accelerate (Tuần 9-12)

-   Scale tất cả các kênh đã chứng minh hiệu quả, cắt bỏ kênh kém
-   Tuyển thêm 20 **LOK** để đạt tổng 50, cover các vùng Tây Nguyên và Tây Bắc
-   Mục tiêu: 350 **hosts** mới (170 qua marketing, 100 qua **LOK**)
-   Launch chương trình "**Super Host**" với các đặc quyền cho **hosts** chất lượng cao
-   Tổ chức offline event "**Local Life Festival**" tại Đà Nẵng + TP.HCM
-   Partnerships với 5-10 khách sạn/hostel đặt **QR code** và brochure
-   Đạt 10.000 users cuối tuần 12

## PHẦN 9: WORKFLOW PHỐI HỢP AGENT

### 9.1 Cơ chế phối hợp 5 Agents

Các **agent** trong **Paperclip AI** phối hợp theo mô hình **hub-and-spoke**, với **CEO Agent** là hub trung tâm điều phối:

**Workflow hàng ngày:**

-   **CEO Agent** đặt ra mục tiêu và nhiệm vụ chiến lược hàng ngày/tuần.
-   **Marketing Agent** nhận nhiệm vụ từ **CEO**, phân tích dữ liệu, lên kế hoạch chiến dịch **ads** và **content**.
-   **Engineering Agent** phát triển và bảo trì nền tảng, đảm bảo các tính năng mới và hiệu suất hệ thống.
-   **HR Agent** quản lý tuyển dụng và hỗ trợ **LOKs**, đảm bảo họ có đủ công cụ và kiến thức.
-   **CTO Agent** giám sát toàn bộ hệ thống kỹ thuật, bao gồm cả các **AI Agent**, đảm bảo vận hành trơn tru và bảo mật.

**Quy trình xử lý sự cố:**

Khi có khiếu nại nghiêm trọng hoặc sự cố hệ thống, các **agent** phối hợp theo quy trình **escalation**:

-   **CTO Agent** phát hiện vấn đề kỹ thuật → thông báo **CEO Agent** + **Engineering Agent**.
-   **HR Agent** nhận report từ **LOK** về **host** vi phạm → thông báo **CEO Agent** → **CEO** quyết định đình chỉ.
-   **Marketing Agent** phát hiện **crisis** trên social media → thông báo **CEO** → **CEO** phân công xử lý.
