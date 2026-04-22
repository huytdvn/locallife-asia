"""OCR parser cho ảnh scan tiếng Việt, dùng Claude Vision.

Lý do chọn Claude Vision thay vì Tesseract+vie:
  - Chữ viết tay tiếng Việt: Claude đọc tốt hơn đáng kể.
  - Scan mờ / nghiêng: Claude chịu được, Tesseract thường lỗi.
  - Tái sử dụng Anthropic API key đã có; 1 workflow, 1 provider.

Downsides: chi phí/ảnh cao hơn, latency cao hơn → dùng cho batch, không realtime.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


OCR_PROMPT = """Đây là ảnh scan 1 tài liệu tiếng Việt. Hãy:
1. Trích toàn bộ chữ có trong ảnh, giữ đúng dấu tiếng Việt.
2. Giữ cấu trúc: xuống dòng, tiêu đề, bảng (dùng markdown table).
3. Không bịa. Nếu có đoạn không đọc được, ghi: [KHÔNG ĐỌC ĐƯỢC].
4. Không thêm bình luận của bạn — chỉ text đã OCR.

Output: chỉ markdown text."""


def parse_image(path: Path) -> dict[str, Any]:
    # TODO(phase-2):
    #   - Load ảnh, encode base64
    #   - Call anthropic.messages.create với image block + OCR_PROMPT
    #   - Dùng Haiku 4.5 cho hiệu năng / Sonnet cho case khó
    #   - Trả {text, tables, metadata: {ocr_engine: "claude-vision"}}
    _ = path
    raise NotImplementedError("Image OCR parser — Phase 2")
