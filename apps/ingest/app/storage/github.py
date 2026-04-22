"""GitHub API client: commit markdown vào knowledge repo + tạo PR draft.

Xem flow: raw → parse → normalize → FM → **commit here** → PR cho owner duyệt.
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.config import ConfigError, get_settings

log = logging.getLogger(__name__)


def _client(token: str) -> httpx.Client:
    return httpx.Client(
        base_url="https://api.github.com",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=30.0,
    )


def _owner_repo() -> tuple[str, str]:
    s = get_settings()
    return s.knowledge_repo_owner, s.knowledge_repo_name


def _require_token() -> str:
    token = get_settings().github_token
    if not token:
        raise ConfigError("GITHUB_TOKEN chưa set — không commit được lên GitHub")
    return token


def get_default_branch_sha() -> str:
    token = _require_token()
    owner, repo = _owner_repo()
    branch = get_settings().knowledge_repo_branch
    with _client(token) as c:
        r = c.get(f"/repos/{owner}/{repo}/git/ref/heads/{branch}")
        r.raise_for_status()
        return r.json()["object"]["sha"]


def create_branch(new_branch: str, from_sha: str) -> None:
    token = _require_token()
    owner, repo = _owner_repo()
    with _client(token) as c:
        r = c.post(
            f"/repos/{owner}/{repo}/git/refs",
            json={"ref": f"refs/heads/{new_branch}", "sha": from_sha},
        )
        r.raise_for_status()


def put_file(
    branch: str,
    repo_path: str,
    content: str,
    message: str,
    existing_sha: str | None = None,
) -> dict[str, str]:
    """Upsert 1 file markdown vào branch. Tạo commit.

    Dùng endpoint `PUT /contents/{path}`. Trả {commit_sha, html_url}.
    """
    token = _require_token()
    owner, repo = _owner_repo()
    encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
    payload: dict[str, object] = {
        "message": message,
        "content": encoded,
        "branch": branch,
    }
    if existing_sha:
        payload["sha"] = existing_sha
    with _client(token) as c:
        r = c.put(
            f"/repos/{owner}/{repo}/contents/{repo_path}",
            json=payload,
        )
        r.raise_for_status()
        data = r.json()
        return {
            "commit_sha": data["commit"]["sha"],
            "html_url": data["content"]["html_url"],
        }


def get_file_sha(branch: str, repo_path: str) -> str | None:
    token = _require_token()
    owner, repo = _owner_repo()
    with _client(token) as c:
        r = c.get(
            f"/repos/{owner}/{repo}/contents/{repo_path}",
            params={"ref": branch},
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json().get("sha")


def create_pull_request(
    head: str,
    title: str,
    body: str,
    draft: bool = True,
) -> dict[str, str]:
    token = _require_token()
    owner, repo = _owner_repo()
    base = get_settings().knowledge_repo_branch
    with _client(token) as c:
        r = c.post(
            f"/repos/{owner}/{repo}/pulls",
            json={
                "title": title,
                "body": body,
                "head": head,
                "base": base,
                "draft": draft,
            },
        )
        r.raise_for_status()
        data = r.json()
        return {"number": str(data["number"]), "html_url": data["html_url"]}


def commit_via_pr(
    *,
    repo_path: str,
    content: str,
    branch_prefix: str,
    title: str,
    body: str,
    draft: bool = True,
) -> dict[str, str]:
    """Orchestrate: tạo branch → put file → tạo PR draft.

    Return {pr_url, pr_number, branch, commit_sha}.
    """
    import time

    base_sha = get_default_branch_sha()
    branch = f"{branch_prefix}-{int(time.time())}"
    create_branch(branch, base_sha)
    existing = get_file_sha(branch, repo_path)
    commit = put_file(branch, repo_path, content, title, existing_sha=existing)
    pr = create_pull_request(branch, title, body, draft=draft)
    return {
        "pr_url": pr["html_url"],
        "pr_number": pr["number"],
        "branch": branch,
        "commit_sha": commit["commit_sha"],
    }
