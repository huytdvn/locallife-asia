# Giao thức nạp dữ liệu

Tài liệu này mô tả **mọi cách dữ liệu đi vào hệ thống** và **interface nào
nhận**. Nguyên tắc: có nhiều kênh đầu vào, nhưng **chỉ một đường đi nội bộ**.

```
            ┌────────────────────────────── INPUT CHANNELS ──────────────────────────────┐
            │                                                                             │
  (1) HTTP  │   POST /upload          multipart/form-data                                 │
  (2) Drive │   pull định kỳ         Google Drive API (service account)                  │
  (3) Git   │   PR tới knowledge repo (người/AI soạn thẳng markdown)                     │
  (4) Email │   forward @knowledge.locallife.asia  (Phase 4)                             │
            │                                                                             │
            └──────────────────────────────────┬──────────────────────────────────────────┘
                                               │
                                               ▼
                            ┌──────── apps/ingest (FastAPI) ────────┐
                            │  POST /upload   → enqueue parse_job   │
                            │  POST /drive/sync → enqueue batch     │
                            │  GET  /jobs/{id} → trạng thái         │
                            └───────────────────┬───────────────────┘
                                                │ (RQ + Redis)
                                                ▼
                            ┌── async worker pipeline ───────────────┐
                            │  1. parsers/   (pdf|docx|xlsx|image)  │
                            │  2. normalize   (whitespace, heading)  │
                            │  3. frontmatter (ULID + AI suggest)    │
                            │  4. commit      (PR to knowledge repo) │
                            │  5. embed       (Voyage-3 → Qdrant)    │
                            └────────────────────────────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
             knowledge/ (GitHub)                                  Qdrant + Postgres
             = source of truth                                     = index/cache
                     │
                     ▼
             apps/web — đọc qua tool `search_knowledge` + `get_document`
```

## Kênh 1 — HTTP upload (chính, dùng hàng ngày)

**Interface**: FastAPI REST, multipart/form-data.

**Endpoint**:
```
POST /upload
Host: ingest.locallife.asia
Authorization: Bearer <INGEST_API_TOKEN>
Content-Type: multipart/form-data
```

**Body** (form fields):
- `file` — file nhị phân (PDF, Docx, Xlsx, PNG, JPG)
- `owner` — email chịu trách nhiệm (bắt buộc)
- `suggested_audience` — JSON array, ví dụ `["employee"]`
- `suggested_sensitivity` — `public` | `internal` | `restricted`
- `tags` — JSON array, tối đa 6 tag
- `note` — (optional) gợi ý cho AI khi sinh front-matter

**Response**:
```json
{
  "job_id": "01HMA12PQ...",
  "status": "queued",
  "raw_object_key": "raw/2026/04/22/01HMA12PQ-sop-booking.pdf",
  "estimated_ready_at": "2026-04-22T15:32:00Z"
}
```

**curl ví dụ**:
```bash
curl -X POST https://ingest.locallife.asia/upload \
  -H "Authorization: Bearer $INGEST_API_TOKEN" \
  -F "file=@./sop-booking-v3.pdf" \
  -F "owner=ops@locallife.asia" \
  -F 'suggested_audience=["employee","lead","admin"]' \
  -F "suggested_sensitivity=internal" \
  -F 'tags=["sop","booking","operations"]' \
  -F "note=Bản cập nhật v3, thay v2 từ 2025-12"
```

**Sau khi upload** hệ thống:
1. Stream file lên R2 ở `raw_object_key`.
2. Enqueue RQ job `parse_and_commit`.
3. Trả `job_id` ngay — user không đợi.

**Theo dõi**:
```
GET /jobs/{job_id}
→ {"status":"parsing|normalizing|drafting|committing|done|failed", "pr_url":"..."}
```

Xong job → **tạo 1 PR** tới repo `locallife-knowledge` với markdown status
`draft`. Owner nhận notify (Slack/email) để review.

## Kênh 2 — Google Drive sync (định kỳ)

**Interface**: nội bộ, không user-facing. Background worker đọc Drive API.

**Cơ chế**:
- 1 service account Google được share quyền read vào folder
  `Knowledge Inbox/` trên Drive công ty.
- Worker chạy mỗi 15 phút, dùng `drive.files.list` với `modifiedTime >
  last_seen_cursor` → lấy file mới/sửa.
- Mỗi file → gọi cùng pipeline như Kênh 1 (không đi qua `/upload` endpoint
  vì nội bộ).

**Trigger thủ công**:
```
POST /drive/sync
Authorization: Bearer <INGEST_API_TOKEN>
```

Trả `{"queued": 7, "cursor": "2026-04-22T14:30:00Z"}`.

**Metadata từ Drive** (đưa vào front-matter `source`):
- `type: drive`
- `path: drive://{folder_id}/{file_id}`
- `captured_at` = `modifiedTime` của file Drive

## Kênh 3 — Git PR trực tiếp

**Interface**: GitHub — không qua ingest service.

- Ai có quyền repo `locallife-knowledge` đều có thể mở PR viết markdown thẳng.
- GitHub Action (`.github/workflows/validate.yml` — Phase 1) chạy:
  1. Validate YAML front-matter (schema trong `apps/ingest/app/pipeline/frontmatter.py`).
  2. Check ULID có unique không.
  3. Block merge nếu thiếu `owner`, `audience`, `sensitivity`, `last_reviewed`.
- Khi PR merge → webhook tới `apps/ingest` trigger **embed job** (không
  cần parse lại vì đã là markdown).

**Webhook**:
```
POST /webhook/knowledge-merged
X-GitHub-Event: push
X-Hub-Signature-256: sha256=...
```

## Kênh 4 — Email ingest (Phase 4, chưa có)

- Forward email tới `inbox@knowledge.locallife.asia`.
- Dịch vụ SES/Postmark nhận → gọi `POST /upload` với attachment + dùng
  subject làm title gợi ý + body email làm `note`.

## Cái gì **không** nên đi vào

- **Dữ liệu cá nhân khách hàng (PII)** → hệ thống khác (CRM). Pipeline sẽ
  reject ở bước normalize khi detect email/SĐT khách hàng trong bảng dài.
- **Secret/API key** → secret manager. Ingest có regex scanner reject.
- **File > 25 MB** → reject ở gateway, yêu cầu cắt nhỏ.

## App đọc dữ liệu ra bằng interface nào?

Phía **`apps/web`** không đọc trực tiếp pipeline. App đọc:

1. **Markdown** từ `knowledge/` — qua filesystem (nếu deploy cùng repo) hoặc
   GitHub Raw API (nếu submodule).
2. **Vector index** (Qdrant) — query qua Qdrant HTTP API, `POST /collections/knowledge/points/search`.
3. **BM25** — Postgres `tsvector` query từ app code.

Ba nguồn này gộp trong `apps/web/lib/retrieval.ts` → trả về cho
Claude tool `search_knowledge` → AI tổng hợp → citation kèm về user.

## Tham chiếu code

- FastAPI endpoints: [`apps/ingest/app/main.py`](../apps/ingest/app/main.py)
- Front-matter schema (Python): [`apps/ingest/app/pipeline/frontmatter.py`](../apps/ingest/app/pipeline/frontmatter.py)
- Front-matter schema (TS, mirror): [`apps/web/lib/rbac.ts`](../apps/web/lib/rbac.ts)
- Tool cho AI: [`apps/web/lib/tools/index.ts`](../apps/web/lib/tools/index.ts)
- Retrieval: [`apps/web/lib/retrieval.ts`](../apps/web/lib/retrieval.ts)

## Chạy demo ngay (không cần Qdrant/Redis/R2)

Xem [`scripts/demo-pipeline.py`](../scripts/demo-pipeline.py) — Python stdlib
thuần, input 1 file text, output markdown + front-matter chuẩn. Mô phỏng
bước 1-3 của pipeline mà không cần hạ tầng.

```bash
python3 scripts/demo-pipeline.py scripts/sample-raw/sop-booking.txt
```
