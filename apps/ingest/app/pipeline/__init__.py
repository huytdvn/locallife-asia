"""Pipeline ingestion: raw → normalized markdown với front-matter.

Thứ tự:
    sources/  → lấy raw (upload, drive)
    parsers/  → extract text (pdf, docx, xlsx, image-OCR)
    normalize → dọn whitespace, phát hiện heading, gom bảng
    frontmatter → sinh YAML front-matter (id ULID, tags, audience, ...)
    embed     → chunk + embed (Voyage-3), upsert Qdrant
    commit    → push markdown vào knowledge repo qua GitHub API
"""
