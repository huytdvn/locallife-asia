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


class SyncRequest(BaseModel):
    changed_path: str | None = None  # repo-relative, e.g., "knowledge/host/faq/abc.md"
    reason: str | None = None


class SyncResponse(BaseModel):
    ok: bool
    detail: str
    r2: bool = False
    error: str | None = None


@app.post("/sync/knowledge", dependencies=[Depends(require_token)])
def sync_knowledge(req: SyncRequest) -> SyncResponse:
    """Tier 1 → tier 2 → tier 3 sync, gọi sau mỗi commit từ web admin UI.

    1. Chạy `scripts/sync-knowledge.sh` để fast-forward KNOWLEDGE_DIR từ git.
    2. Nếu `changed_path` được cung cấp, đọc file đã sync, parse FM, push
       lên R2 immutable archive.
    """
    import subprocess
    from pathlib import Path

    s = get_settings()

    # Tìm script — ưu tiên path tương đối với image (mount), fallback paths.
    script_candidates = [
        Path("/app/scripts/sync-knowledge.sh"),
        Path(__file__).resolve().parent.parent.parent.parent / "scripts" / "sync-knowledge.sh",
    ]
    script = next((p for p in script_candidates if p.exists()), None)
    if script is None:
        raise HTTPException(
            status_code=500,
            detail=f"sync-knowledge.sh không tìm thấy: thử {script_candidates}",
        )

    env = {
        "KNOWLEDGE_DIR": str(s.knowledge_dir),
        "KNOWLEDGE_REPO_OWNER": s.knowledge_repo_owner,
        "KNOWLEDGE_REPO_NAME": s.knowledge_repo_name,
        "KNOWLEDGE_REPO_BRANCH": s.knowledge_repo_branch,
        "GITHUB_TOKEN": s.github_token,
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": "/tmp",
    }
    try:
        proc = subprocess.run(
            ["bash", str(script)],
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return SyncResponse(ok=False, detail="", error="sync timeout (60s)")

    sync_log = (proc.stderr or proc.stdout or "").strip()[-300:]
    if proc.returncode != 0:
        return SyncResponse(
            ok=False,
            detail=sync_log,
            error=f"sync-knowledge.sh exit {proc.returncode}",
        )

    # R2 archive — best-effort, lỗi không invalidate sync.
    r2_ok = False
    if req.changed_path:
        try:
            r2_ok = _archive_one_to_r2(req.changed_path)
        except Exception as e:  # noqa: BLE001
            log.warning("R2 archive failed for %s: %s", req.changed_path, e)
            return SyncResponse(
                ok=True, detail=sync_log, r2=False, error=f"r2: {e}"
            )

    return SyncResponse(ok=True, detail=sync_log, r2=r2_ok)


def _archive_one_to_r2(repo_path: str) -> bool:
    """Đọc file từ KNOWLEDGE_DIR, parse FM lấy sensitivity, đẩy R2 immutable.

    `repo_path` là path tương đối repo (vd "knowledge/host/faq/abc.md").
    KNOWLEDGE_DIR là git working tree → file thực ở
    `KNOWLEDGE_DIR/<repo_path-without-knowledge-prefix>` HOẶC
    `KNOWLEDGE_DIR/<repo_path>` tuỳ subdir convention.
    """
    import hashlib
    import re
    from pathlib import Path

    from app.storage.r2 import put_immutable

    s = get_settings()
    kb = Path(s.knowledge_dir)
    subdir = s.knowledge_repo_subdir or ""
    rel = repo_path
    if subdir and rel.startswith(f"{subdir}/"):
        rel = rel[len(subdir) + 1 :]
    abs_path = kb / rel
    if not abs_path.exists():
        log.warning("R2 archive: file không tồn tại sau sync: %s", abs_path)
        return False
    raw = abs_path.read_bytes()

    fm_re = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
    text = raw.decode("utf-8", errors="replace")
    sensitivity = "internal"
    doc_id = ""
    m = fm_re.match(text)
    if m:
        for line in m.group(1).splitlines():
            mm = re.match(r"^(id|sensitivity):\s*(.+?)\s*$", line)
            if mm:
                val = mm.group(2).strip().strip("\"'")
                if mm.group(1) == "sensitivity":
                    sensitivity = val
                else:
                    doc_id = val
    content_sha = hashlib.sha256(raw).hexdigest()
    key = f"{doc_id or 'unknown'}/{content_sha}.md"
    put_immutable(
        bucket="kb-archive",
        key=key,
        body=raw,
        content_type="text/markdown; charset=utf-8",
        sensitivity=sensitivity,
    )
    return True
