"""Source: HTTP upload. Handler gọi từ FastAPI route."""

from __future__ import annotations

from dataclasses import asdict, dataclass

from app.pipeline.jobs import enqueue_ingest
from app.storage.raw import raw_store


@dataclass
class UploadResult:
    job_id: str
    local_path: str
    ulid: str
    drive_file_id: str | None


def handle_upload(
    *,
    filename: str,
    data: bytes,
    owner_email: str,
    hint_audience: list[str] | None = None,
    hint_sensitivity: str | None = None,
    hint_tags: list[str] | None = None,
    note: str | None = None,
) -> UploadResult:
    stored = raw_store(filename, data)
    job = enqueue_ingest(
        local_path=stored["local_path"],
        ulid=stored["ulid"],
        owner_email=owner_email,
        original_name=filename,
        hint_audience=hint_audience or [],
        hint_sensitivity=hint_sensitivity,
        hint_tags=hint_tags or [],
        note=note,
    )
    return UploadResult(
        job_id=job,
        local_path=stored["local_path"],
        ulid=stored["ulid"],
        drive_file_id=stored.get("drive_file_id"),
    )


def to_dict(r: UploadResult) -> dict[str, str | None]:
    return asdict(r)  # type: ignore[no-any-return]
