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
) -> dict[str, str | None]:
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
        )
    except ConfigError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {"status": "queued", **to_dict(result)}


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
