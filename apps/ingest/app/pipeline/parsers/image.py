"""OCR parser cho ảnh scan tiếng Việt, dùng Gemini Vision.

Gemini 2.5 Flash xử lý tiếng Việt (có dấu, viết tay, scan mờ) tốt hơn
Tesseract+vie cho use-case của mình, và dùng chung provider với chat.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from app.config import ConfigError, get_settings
from app.pipeline.parsers import ParsedDoc

OCR_PROMPT = """Đây là ảnh scan 1 tài liệu tiếng Việt. Hãy:
1. Trích toàn bộ chữ có trong ảnh, giữ đúng dấu tiếng Việt.
2. Giữ cấu trúc: xuống dòng, tiêu đề (dùng # / ##), bảng (dùng markdown table).
3. Không bịa. Đoạn không đọc được ghi: [KHÔNG ĐỌC ĐƯỢC].
4. Không thêm bình luận của bạn — chỉ markdown text đã OCR.
"""


def parse(path: Path) -> ParsedDoc:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ConfigError(
            "GEMINI_API_KEY chưa set — image OCR cần Gemini Vision"
        )

    from google import genai  # lazy import
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    mime = mimetypes.guess_type(str(path))[0] or "image/jpeg"
    image_bytes = path.read_bytes()

    response = client.models.generate_content(
        model=settings.gemini_model_chat,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime),
            OCR_PROMPT,
        ],
    )
    text = (response.text or "").strip()

    return ParsedDoc(
        text=text,
        metadata={
            "source_type": "image",
            "ocr_engine": f"gemini:{settings.gemini_model_chat}",
            "mime": mime,
        },
    )
