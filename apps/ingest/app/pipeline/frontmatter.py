"""Schema + sinh front-matter cho mọi doc markdown.

Đồng bộ với `knowledge/README.md`. Là single source of truth cho format
front-matter ở phía ingestion. Phía web (TypeScript) có schema tương ứng
trong `apps/web/lib/rbac.ts` (DocMeta).
"""

from __future__ import annotations

import json
from datetime import date
from enum import StrEnum
from typing import Literal

import yaml
from pydantic import BaseModel, EmailStr, Field
from ulid import ULID

from app.config import ConfigError, get_settings


class Audience(StrEnum):
    employee = "employee"
    lead = "lead"
    admin = "admin"


class Sensitivity(StrEnum):
    public = "public"
    internal = "internal"
    restricted = "restricted"


class SourceRef(BaseModel):
    type: Literal["manual", "pdf", "drive", "scan", "docx", "xlsx", "csv", "image"]
    path: str
    captured_at: date
    sha256: str | None = None


class FrontMatter(BaseModel):
    id: str = Field(..., description="ULID, bất biến")
    title: str
    owner: EmailStr
    audience: list[Audience]
    sensitivity: Sensitivity
    tags: list[str]
    source: list[SourceRef] = Field(default_factory=list)
    last_reviewed: date
    reviewer: EmailStr
    status: Literal["draft", "approved", "deprecated"]
    related: list[str] = Field(default_factory=list)


def new_draft(
    *,
    title: str,
    owner: str,
    source: SourceRef,
    suggested_audience: list[Audience],
    suggested_sensitivity: Sensitivity,
    tags: list[str],
) -> FrontMatter:
    today = date.today()
    return FrontMatter(
        id=str(ULID()),
        title=title,
        owner=owner,  # type: ignore[arg-type]
        audience=suggested_audience,
        sensitivity=suggested_sensitivity,
        tags=tags,
        source=[source],
        last_reviewed=today,
        reviewer=owner,  # type: ignore[arg-type]
        status="draft",
        related=[],
    )


def to_markdown(fm: FrontMatter, body: str) -> str:
    """Serialize FrontMatter + body → markdown hoàn chỉnh."""
    raw = fm.model_dump(mode="json")
    yaml_block = yaml.safe_dump(raw, sort_keys=False, allow_unicode=True).strip()
    return f"---\n{yaml_block}\n---\n\n{body.rstrip()}\n"


SUGGEST_PROMPT = """Bạn là trợ lý phân loại tài liệu nội bộ. Dựa vào nội
dung tài liệu sau, trả về JSON duy nhất với các field:
- title: tiêu đề ngắn gọn, tiếng Việt, <= 80 ký tự.
- tags: 3-6 tag snake-case không dấu, tiếng Anh.
- suggested_audience: list con của ["employee","lead","admin"].
- suggested_sensitivity: "public" | "internal" | "restricted".

Nguyên tắc sensitivity:
- public: nội dung có thể công khai (vision, giá trị).
- internal: quy trình/SOP/policy nội bộ — MẶC ĐỊNH.
- restricted: tài chính, hợp đồng, định giá, thông tin cá nhân.

Chỉ trả JSON, không giải thích.
"""


class Suggestion(BaseModel):
    title: str
    tags: list[str]
    suggested_audience: list[Audience]
    suggested_sensitivity: Sensitivity


def suggest_metadata(body: str) -> Suggestion:
    """Hỏi Gemini gợi ý title/tags/audience/sensitivity.

    Raises ConfigError nếu GEMINI_API_KEY chưa set.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ConfigError("GEMINI_API_KEY chưa set — không gợi ý được metadata")
    from google import genai

    client = genai.Client(api_key=settings.gemini_api_key)
    excerpt = body[:6000]
    response = client.models.generate_content(
        model=settings.gemini_model_fast,
        contents=[SUGGEST_PROMPT, "\n\nTài liệu:\n", excerpt],
        config={"response_mime_type": "application/json"},
    )
    raw = (response.text or "").strip()
    data = json.loads(raw)
    return Suggestion.model_validate(data)
