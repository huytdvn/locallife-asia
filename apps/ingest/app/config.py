"""Pydantic settings cho ingest service. Đọc từ env (hoặc .env.local).

Mọi external integration (Gemini, R2, Drive, GitHub) đều optional — service
phải boot được mà không crash khi thiếu credentials. Từng pipeline step tự
kiểm tra required creds và raise `ConfigError` với thông báo rõ ràng.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Service ---
    app_env: str = Field(default="development")
    ingest_api_token: str = Field(
        default="",
        description="Bearer token shared giữa web ↔ ingest. Bắt buộc ở prod.",
    )

    # --- AI (Gemini) ---
    gemini_api_key: str = Field(default="")
    gemini_model_chat: str = Field(default="gemini-2.5-flash")
    gemini_model_fast: str = Field(default="gemini-2.5-flash-lite")

    # --- Raw tier ---
    raw_dir: Path = Field(default=Path("/mnt/locallife-raw"))
    legal_dir: Path = Field(default=Path("/mnt/locallife-legal"))
    max_raw_mb: int = Field(default=25)

    # --- Google Drive ---
    google_drive_raw_folder_id: str = Field(default="")
    google_drive_legal_folder_id: str = Field(default="")
    google_service_account_json: Path = Field(
        default=Path("./google-service-account.json")
    )

    # --- Knowledge repo (GitHub) ---
    knowledge_repo_owner: str = Field(default="huytdvn")
    knowledge_repo_name: str = Field(default="locallife-asia")
    knowledge_repo_branch: str = Field(default="main")
    knowledge_repo_subdir: str = Field(
        default="knowledge",
        description="Subdir trong repo chứa knowledge/. Để trống khi repo được tách riêng.",
    )
    github_token: str = Field(default="")

    # --- R2 archive ---
    r2_account_id: str = Field(default="")
    r2_access_key_id: str = Field(default="")
    r2_secret_access_key: str = Field(default="")
    r2_bucket_raw: str = Field(default="locallife-raw")
    r2_bucket_kb_archive: str = Field(default="locallife-kb-archive")

    # --- Queue ---
    redis_url: str = Field(default="redis://localhost:6379")
    job_queue_name: str = Field(default="ingest")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


class ConfigError(RuntimeError):
    """Raise khi một step cần config mà env chưa đủ."""
