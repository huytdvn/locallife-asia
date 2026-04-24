"""Raw storage: lưu file gốc vào local server + Google Drive (2-way)."""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import date
from pathlib import Path

import redis
from ulid import ULID

from app.config import ConfigError, get_settings

log = logging.getLogger(__name__)


def local_path_for(filename: str) -> tuple[Path, str]:
    """Sinh đường dẫn `$RAW_DIR/YYYY/MM/{ulid}.{ext}` cho 1 file raw mới.

    Return (absolute_path, ulid).
    """
    settings = get_settings()
    ulid = str(ULID())
    ext = Path(filename).suffix.lstrip(".").lower() or "bin"
    today = date.today()
    rel = Path(str(today.year)) / f"{today.month:02d}" / f"{ulid}.{ext}"
    target = settings.raw_dir / rel
    return target, ulid


def save_local(target: Path, data: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)


def upload_to_drive(local_path: Path, drive_folder_id: str | None = None) -> str | None:
    """Upload local file lên Google Drive (tier 2 raw).

    Non-fatal: log + skip nếu thiếu creds hoặc Drive fail. Primary là local.
    Return Drive file_id, hoặc None nếu skipped/failed.
    """
    settings = get_settings()
    folder_id = drive_folder_id or settings.google_drive_raw_folder_id
    if not folder_id:
        log.info("skip Drive upload: GOOGLE_DRIVE_RAW_FOLDER_ID chưa set")
        return None
    if not settings.google_service_account_json.exists():
        log.warning(
            "skip Drive upload: %s không tồn tại",
            settings.google_service_account_json,
        )
        return None

    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:  # pragma: no cover
        log.error("google-api-python-client chưa cài")
        return None

    creds = Credentials.from_service_account_file(
        str(settings.google_service_account_json),
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )
    service = build("drive", "v3", credentials=creds, cache_discovery=False)
    media = MediaFileUpload(str(local_path), resumable=False)
    created = (
        service.files()
        .create(
            body={"name": local_path.name, "parents": [folder_id]},
            media_body=media,
            fields="id",
            supportsAllDrives=True,
        )
        .execute()
    )
    return created.get("id")


def content_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


_FM_SHA_RE = re.compile(r"sha256:\s*([0-9a-f]{64})", re.IGNORECASE)


def _redis():
    return redis.from_url(get_settings().redis_url, decode_responses=True)


def _hash_key(sha: str) -> str:
    return f"ingest:hash:{sha.lower()}"


def register_hash(sha: str, ulid: str, ttl: int = 7 * 24 * 3600) -> None:
    """Ghi nhớ hash → ulid ở Redis ngay sau upload để dedup in-flight
    (trước khi worker kịp ghi markdown vào knowledge/). TTL 7 ngày — đủ
    dài để tránh race, đủ ngắn để không rò rỉ bộ nhớ.
    """
    try:
        _redis().setex(_hash_key(sha), ttl, ulid)
    except Exception as e:
        log.warning("Redis hash register failed: %s", e)


def find_existing_by_hash(kb_dir: Path, sha: str) -> tuple[Path | None, str | None]:
    """Tìm doc cùng sha256: check Redis (in-flight) trước, fallback scan KB.

    Return (path, source): path = markdown file, source = "redis" | "kb" | None.
    """
    try:
        ulid = _redis().get(_hash_key(sha))
        if ulid:
            # Có trong Redis → chưa chắc đã có file .md (worker chưa xong).
            # Trả về path "ảo" để upload handler biết đã được queue.
            return kb_dir / f"inbox/{ulid}-*.md", "redis"
    except Exception as e:
        log.warning("Redis hash lookup failed: %s", e)

    if not kb_dir.exists():
        return None, None
    for md in kb_dir.rglob("*.md"):
        if md.name == "README.md":
            continue
        try:
            with md.open("rb") as f:
                head = f.read(4096).decode("utf-8", errors="ignore")
        except OSError:
            continue
        m = _FM_SHA_RE.search(head)
        if m and m.group(1).lower() == sha.lower():
            return md, "kb"
    return None, None


def raw_store(filename: str, data: bytes) -> dict[str, str | None]:
    """Ghi 1 file raw vào **cả 2 tier**. Local là primary — fail local = fail.

    Ngoài local_path + ulid, trả luôn `sha256` để pipeline attach vào FM.
    Return {local_path, ulid, drive_file_id, sha256}.
    """
    if not data:
        raise ConfigError("File rỗng")
    settings = get_settings()
    if len(data) > settings.max_raw_mb * 1024 * 1024:
        raise ConfigError(f"File vượt quá {settings.max_raw_mb}MB")

    sha = content_sha256(data)
    target, ulid = local_path_for(filename)
    save_local(target, data)
    drive_id: str | None = None
    try:
        drive_id = upload_to_drive(target)
    except Exception as e:  # non-fatal
        log.warning("Drive upload failed: %s", e)
    return {
        "local_path": str(target),
        "ulid": ulid,
        "drive_file_id": drive_id,
        "sha256": sha,
    }
