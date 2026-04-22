"""Source: Google Drive poll với cursor.

Đọc folder `GOOGLE_DRIVE_RAW_FOLDER_ID`, lọc theo `modifiedTime > cursor`,
pull về local `$RAW_DIR`, enqueue ingest job mỗi file.

Cursor lưu ở Redis key `drive:last_cursor` (ISO timestamp).
"""

from __future__ import annotations

import io
import logging
from datetime import UTC, datetime

import redis

from app.config import ConfigError, get_settings
from app.pipeline.jobs import enqueue_ingest
from app.storage.raw import local_path_for, save_local

log = logging.getLogger(__name__)
CURSOR_KEY = "drive:last_cursor"


def _drive_service():
    s = get_settings()
    if not s.google_service_account_json.exists():
        raise ConfigError(
            f"{s.google_service_account_json} không tồn tại"
        )
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    creds = Credentials.from_service_account_file(
        str(s.google_service_account_json),
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _redis():
    return redis.from_url(get_settings().redis_url, decode_responses=True)


def _get_cursor() -> str:
    r = _redis()
    return r.get(CURSOR_KEY) or "2025-01-01T00:00:00Z"


def _set_cursor(iso: str) -> None:
    _redis().set(CURSOR_KEY, iso)


def poll_drive(owner_email: str) -> dict[str, int | str]:
    """Poll Drive folder, pull file mới về local, enqueue jobs.

    Return {found, queued, cursor}.
    """
    s = get_settings()
    if not s.google_drive_raw_folder_id:
        raise ConfigError("GOOGLE_DRIVE_RAW_FOLDER_ID chưa set")

    service = _drive_service()
    cursor = _get_cursor()
    q = (
        f"'{s.google_drive_raw_folder_id}' in parents "
        f"and trashed = false "
        f"and modifiedTime > '{cursor}'"
    )
    resp = (
        service.files()
        .list(
            q=q,
            fields="files(id, name, mimeType, modifiedTime)",
            pageSize=100,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    files = resp.get("files", [])

    queued = 0
    latest_mod: str = cursor
    from googleapiclient.http import MediaIoBaseDownload

    for f in files:
        try:
            fh = io.BytesIO()
            request = service.files().get_media(fileId=f["id"])
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            data = fh.getvalue()
            target, ulid = local_path_for(f["name"])
            save_local(target, data)
            enqueue_ingest(
                local_path=str(target),
                ulid=ulid,
                owner_email=owner_email,
                original_name=f["name"],
                hint_audience=[],
                hint_sensitivity=None,
                hint_tags=[],
                note=f"from drive:{f['id']}",
            )
            queued += 1
            if f["modifiedTime"] > latest_mod:
                latest_mod = f["modifiedTime"]
        except Exception as e:  # non-fatal, process others
            log.exception("pull drive file failed: %s (%s)", f.get("name"), e)

    if queued > 0:
        _set_cursor(latest_mod)
    return {"found": len(files), "queued": queued, "cursor": latest_mod}


def now_iso() -> str:
    return datetime.now(UTC).isoformat()
