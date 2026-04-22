# Storage Architecture — Local Life Asia

Spec kiến trúc lưu trữ cho nội dung nghiệp vụ của Local Life Asia.
Áp dụng nguyên tắc **replication theo loại dữ liệu**, ưu tiên
bất-biến cho hợp đồng + provider diversity để chịu được sự cố ở bất kỳ tier nào.

> **Nguyên tắc vàng**: không tier nào vừa là source-of-truth vừa là
> runtime read path. Git = truth, local server = runtime read, R2 = archive.

## 1. Phân loại dữ liệu

| Loại | Ví dụ | Định dạng | Replication |
|------|-------|-----------|-------------|
| **Text nghiệp vụ** | SOP, policy, vision, values | Markdown + YAML FM | **3-way** (text tier) |
| **Hợp đồng working-copy** | Draft/revision, bản làm việc nội bộ | Markdown + YAML FM | **3-way** (text tier) |
| **Partner docs** | 1-pager host, artisan profile, supplier spec | Markdown + YAML FM | **3-way** (text tier) |
| **Raw file** | PDF scan, ảnh CMND, DOCX gốc, Excel | Binary | **2-way** (raw tier) |
| **Hợp đồng bản chính (đã ký)** | PDF có chữ ký | Binary PDF | **2-way + R2 object lock** (ngoại lệ — xem §4) |
| **Vector / index** | Embedding, BM25 table | Blob/SQL | **1-way** (rebuild từ markdown) |
| **Audit log** | Tool calls, user queries | SQL | **1-way** (Postgres, backup cold) |

## 2. Text tier — 3-way replication

```
    ┌─────────────────────┐
    │ GitHub remote       │ ← PR / diff / collab (human + AI draft_update)
    │ locallife-knowledge │
    └──────────┬──────────┘
               │ post-merge webhook
               ↓
    ┌─────────────────────┐           ┌──────────────────────────┐
    │ Local server công ty│──────────▶│ Cloudflare R2            │
    │ /var/locallife/kb/  │  rclone   │ locallife-kb-archive     │
    │ (chatbot reads here)│  hourly   │ (object-lock, versioned) │
    └─────────────────────┘           └──────────────────────────┘
```

### 2.1 Git (GitHub) — source of truth

- **Repo**: `locallife-knowledge` (sẽ tách Phase 1).
- **Vai trò**: duy nhất nơi content thay đổi có thể merge/revert qua PR.
- **Ai ghi**: con người (qua GitHub UI) + AI (`draft_update` tool tạo
  PR; `commit_update` push thẳng — chỉ admin).
- **Retention**: full git history, không GC.
- **Restore từ các tier khác**: nếu git mất (account lockout, GitHub down),
  `git init` mới từ local server (tier 2) → `git push` lên host backup.

### 2.2 Local server công ty — runtime read path

- **Path**: `/var/locallife/kb/` (prod) hoặc `$KNOWLEDGE_DIR` (dev).
- **Vai trò**: chatbot + admin UI đọc trực tiếp từ đây (filesystem,
  nhanh, offline-safe). **Không đọc từ git hay R2 ở runtime.**
- **Đồng bộ**: webhook GitHub `push` → pull; cron 5 phút làm fallback.
  Xem `scripts/sync-knowledge.sh` và `scripts/kb-webhook/`.
- **Recovery**: nếu local server mất, `git clone` lại — mất ~5 phút.

### 2.3 Cloudflare R2 — immutable archive

- **Bucket**: `locallife-kb-archive`.
- **Object lock**: COMPLIANCE mode, retention 10 năm cho sensitivity
  `restricted`; 3 năm cho `internal`; 1 năm cho `public`.
- **Versioning**: bật, mọi update tạo version mới — không xoá được.
- **Vai trò**: legal/compliance archive, provider-diversity với GitHub.
  Dùng khi kiểm toán, khiếu nại hợp đồng, hoặc khôi phục sau vi phạm
  bảo mật GitHub.
- **Write flow**: worker nightly (+ on-demand khi merge PR có `sensitivity:
  restricted`) → upload bản markdown + PDF kèm theo dạng
  `{id}/{ulid-version}.{ext}`, không ghi đè.
- **Không phục vụ runtime read** — latency cao, chi phí cao nếu list nhiều.

## 3. Raw tier — 2-way replication

```
RAW upload (web UI / email / Drive import)
   │
   ├─────────────────────────────┐
   ↓                             ↓
/mnt/locallife-raw/...   Google Drive "LLA Raw/..."
(local server, ZFS)      (shared với partner)
```

- **Local server**: `/mnt/locallife-raw/YYYY/MM/{ulid}.{ext}`. Primary.
  ZFS snapshot nightly (7-day rolling).
- **Google Drive**: folder `LLA Raw/` + subfolder theo phòng ban. Vai trò:
  - UX quen thuộc cho nhân sự phi-dev.
  - Share link cho partner nộp file.
  - Mobile-first cho sale/host onboarding tại site.
- **Đồng bộ**:
  - Upload qua web UI → lưu local server → push bản sao lên Drive (service account).
  - Upload qua Drive → poll delta (15 phút) → pull về local server → enqueue parse.
- **Không dùng R2 cho raw** — Drive đã đủ UX; R2 chỉ cho text archive.

## 4. Ngoại lệ: hợp đồng bản chính (đã ký)

Hợp đồng có chữ ký là **tài sản pháp lý**, cần bất-biến hơn mọi loại khác:

- **Bản chính PDF (đã ký)**: lưu 3 nơi
  1. Local server `/mnt/locallife-legal/{partner-id}/{contract-id}.pdf`
     (ZFS snapshot, read-only).
  2. Google Drive `LLA Legal/ (restricted)` — access chỉ admin + legal counsel.
  3. **R2 `locallife-kb-archive/legal/`** với object-lock COMPLIANCE 10 năm.
- **Working copy (markdown, để AI đọc/chỉnh)**: 3-way text tier bình thường,
  có FM `related_contract: {id}` link tới bản chính.
- **SHA-256 hash của PDF bản chính** ghi vào FM của working copy (`source.sha256`).
  AI check hash khi trả lời → nếu mismatch → cảnh báo "working copy lệch với
  bản chính, gọi admin".

## 5. Biến môi trường

```bash
# Local server mount (runtime read)
KNOWLEDGE_DIR=/var/locallife/kb

# Git remote (source of truth)
KNOWLEDGE_REPO_OWNER=huytdvn
KNOWLEDGE_REPO_NAME=locallife-knowledge
KNOWLEDGE_REPO_BRANCH=main
GITHUB_TOKEN=                          # fine-grained PAT

# R2 archive (text tier 3)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_RAW=locallife-raw            # raw tier
R2_BUCKET_KB_ARCHIVE=locallife-kb-archive  # text archive + legal

# Local server raw mount
RAW_DIR=/mnt/locallife-raw
LEGAL_DIR=/mnt/locallife-legal

# Google Drive (raw tier 2 + legal)
GOOGLE_DRIVE_RAW_FOLDER_ID=
GOOGLE_DRIVE_LEGAL_FOLDER_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=./google-service-account.json
```

## 6. Recovery playbook

| Tier mất | Khôi phục từ | Thời gian ước tính | Mất gì |
|----------|--------------|---------------------|--------|
| Local server | `git clone` + `rclone sync` (R2 cho bản đã lock) | ~10 phút | Nothing (các tier khác đủ) |
| GitHub | `git init` từ local server + push host backup | ~30 phút | Commit history chưa push (nếu có) |
| R2 archive | Re-upload từ git + local server | ~1 giờ | Nothing (archive có thể rebuild, nhưng mất object-lock timestamp gốc) |
| Google Drive | Re-upload từ local server | ~2 giờ / 1000 file | Nothing (raw có ở local) |
| Tất cả 3 tier text cùng lúc | Thảm hoạ — cần tái tạo từ con người | Ngày/tuần | Toàn bộ nội dung (xác suất ~0) |

Thử drill khôi phục **quý 1 lần**, mỗi lần mất 1 tier.

## 7. Policy tóm tắt

1. **Chatbot runtime chỉ đọc từ local server**. Không gọi git clone / R2
   list trong request path.
2. **Mọi thay đổi text phải đi qua git**. Không sửa thẳng local server
   (cron pull sẽ ghi đè).
3. **Hợp đồng ký xong đi thẳng vào R2 với object-lock**. Không tin cây
   git cho bản chính.
4. **File raw lên web UI lưu local trước, Drive sau**. Nếu Drive fail,
   vẫn có ở local (không block UX).
5. **`KNOWLEDGE_DIR` env là điểm thoát duy nhất để trỏ sang đường khác**
   (dev/staging/test). Không hard-code path trong code.
