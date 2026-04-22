# `apps/ingest` — Pipeline ingestion (Python)

Chuyển dữ liệu thô (PDF, Word, Excel, Google Drive, ảnh scan) thành markdown
có front-matter, commit vào repo `knowledge/`.

## Phase 0 (hiện tại)

Skeleton FastAPI + stub parsers. Chưa chạy production.

## Kiến trúc pipeline

```
raw file ─┐
Drive   ──┼─► sources/      ─► parsers/      ─► normalize ─► frontmatter ─► commit
scan    ──┘   (capture R2)    (text + tables)  (clean)       (YAML + ULID)  (GitHub API)
                                                                 │
                                                                 ▼
                                                           embed/upsert Qdrant
```

## Chạy dev (khi Phase 2 sẵn sàng)

```bash
cd apps/ingest
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8001
```

## Các TODO chính (Phase 2)

- [ ] PDF parser (unstructured + pdfplumber fallback)
- [ ] Docx/Xlsx parser
- [ ] Image OCR parser (Claude Vision cho tiếng Việt)
- [ ] Google Drive sync (service account)
- [ ] R2 upload client
- [ ] GitHub API commit client
- [ ] RQ worker + Redis queue
- [ ] Voyage-3 embedding + Qdrant upsert
