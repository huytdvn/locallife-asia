"""R2 storage — tier 3 text archive (object-locked).

Ta đã có `scripts/sync-to-r2.py` chạy batch; module này dùng khi muốn
archive ngay 1 file từ pipeline (vd: commit hợp đồng ký xong).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.config import ConfigError, get_settings

log = logging.getLogger(__name__)

RETENTION_YEARS: dict[str, int] = {
    "restricted": 10,
    "internal": 3,
    "public": 1,
}


def _client():
    s = get_settings()
    if not (s.r2_account_id and s.r2_access_key_id and s.r2_secret_access_key):
        raise ConfigError("R2 credentials chưa set đầy đủ")
    try:
        import boto3  # lazy
    except ImportError as e:
        raise ConfigError("boto3 chưa cài") from e
    return boto3.client(
        "s3",
        endpoint_url=f"https://{s.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=s.r2_access_key_id,
        aws_secret_access_key=s.r2_secret_access_key,
        region_name="auto",
    )


def put_immutable(
    *,
    bucket: Literal["raw", "kb-archive"],
    key: str,
    body: bytes,
    content_type: str,
    sensitivity: str = "internal",
) -> str:
    """Put vào R2 với Object Lock COMPLIANCE mode.

    Return full s3://.../key để audit log.
    """
    s = get_settings()
    bucket_name = s.r2_bucket_raw if bucket == "raw" else s.r2_bucket_kb_archive
    client = _client()
    years = RETENTION_YEARS.get(sensitivity, 3)
    retain_until = datetime.now(timezone.utc) + timedelta(days=365 * years)
    client.put_object(
        Bucket=bucket_name,
        Key=key,
        Body=body,
        ContentType=content_type,
        ObjectLockMode="COMPLIANCE",
        ObjectLockRetainUntilDate=retain_until,
    )
    return f"s3://{bucket_name}/{key}"
