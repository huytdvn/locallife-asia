"""Schema + sinh front-matter cho mọi doc markdown.

Đồng bộ với `knowledge/README.md`. Là single source of truth cho format
front-matter ở phía ingestion. Phía web (TypeScript) có schema tương ứng
trong `apps/web/lib/rbac.ts` (DocMeta).
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class Audience(str, Enum):
    employee = "employee"
    lead = "lead"
    admin = "admin"


class Sensitivity(str, Enum):
    public = "public"
    internal = "internal"
    restricted = "restricted"


class SourceRef(BaseModel):
    type: Literal["manual", "pdf", "drive", "scan"]
    path: str
    captured_at: date


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
    """Sinh front-matter draft khi pipeline mới trích xuất 1 doc.

    Bước duyệt sau đó (owner) sẽ đổi status → approved.
    """
    from ulid import ULID  # type: ignore[import-not-found]

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
