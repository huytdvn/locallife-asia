"""FastAPI entrypoint cho pipeline ingestion."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import ConfigError, get_settings
from app.pipeline.jobs import get_job_status
from app.sources.drive import poll_drive
from app.sources.upload import handle_upload, to_dict

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title="Local Life Asia — Ingest", version="0.1.0")


class Health(BaseModel):
    status: str
    version: str


def require_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> None:
    expected = get_settings().ingest_api_token
    if not expected:
        return  # dev: token not required when not set
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Thiếu Authorization")
    token = authorization.removeprefix("Bearer ").strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Token không hợp lệ")


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", version="0.1.0")


@app.post("/upload", dependencies=[Depends(require_token)])
async def upload(
    file: Annotated[UploadFile, File(...)],
    owner: Annotated[str, Form(..., description="email chịu trách nhiệm")],
    suggested_audience: Annotated[str | None, Form()] = None,
    suggested_sensitivity: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
    note: Annotated[str | None, Form()] = None,
    force: Annotated[str | None, Form()] = None,
    target_zone: Annotated[str | None, Form()] = None,
    target_dept: Annotated[str | None, Form()] = None,
    target_subfolder: Annotated[str | None, Form()] = None,
) -> dict[str, object]:
    import json

    data = await file.read()
    try:
        audience = json.loads(suggested_audience) if suggested_audience else []
        tag_list = json.loads(tags) if tags else []
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail=f"audience/tags phải là JSON array: {e}",
        ) from e

    try:
        result = handle_upload(
            filename=file.filename or "unnamed.bin",
            data=data,
            owner_email=owner,
            hint_audience=audience,
            hint_sensitivity=suggested_sensitivity,
            hint_tags=tag_list,
            note=note,
            force=(force or "").lower() in ("1", "true", "yes"),
            target_zone=target_zone or None,
            target_dept=target_dept or None,
            target_subfolder=target_subfolder or None,
        )
    except ConfigError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if result.dedup_status == "review-needed":
        # Trả 409 để UI biết cần admin review
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=409,
            content={
                "status": "review-needed",
                "error": "AI phát hiện tài liệu tương tự — admin review trước khi upload",
                **to_dict(result),
            },
        )

    status = "duplicate" if result.dedup_status in ("duplicate", "in-flight") else "queued"
    return {"status": status, **to_dict(result)}


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
def job_status(job_id: str) -> dict[str, object]:
    return get_job_status(job_id)


@app.post("/drive/sync", dependencies=[Depends(require_token)])
def drive_sync(
    owner: Annotated[str, Header(alias="X-Owner-Email")] = "ops@locallife.asia",
) -> dict[str, object]:
    try:
        return dict(poll_drive(owner))
    except ConfigError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
