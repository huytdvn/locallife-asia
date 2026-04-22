"""FastAPI entrypoint cho pipeline ingestion.

Phase 0: endpoints stub. Phase 2 sẽ hiện thực hoá đầy đủ:
  - POST /upload           nhận file raw → queue job
  - GET  /jobs/{id}        trạng thái job
  - POST /drive/sync       trigger đồng bộ Google Drive
  - GET  /health
"""

from fastapi import FastAPI, UploadFile
from pydantic import BaseModel

app = FastAPI(title="Local Life Asia — Ingest")


class Health(BaseModel):
    status: str
    version: str


@app.get("/health", response_model=Health)
def health() -> Health:
    return Health(status="ok", version="0.0.0")


@app.post("/upload")
async def upload(file: UploadFile) -> dict[str, str]:
    # TODO(phase-2):
    #   1. Lưu file lên R2
    #   2. Enqueue job: parse → normalize → frontmatter → commit to knowledge repo
    #   3. Trả job_id
    _ = await file.read()
    return {"status": "accepted", "filename": file.filename or "unknown"}


@app.post("/drive/sync")
def drive_sync() -> dict[str, str]:
    # TODO(phase-2): đồng bộ folder chia sẻ, phát hiện delta, queue parse jobs
    return {"status": "not-implemented"}
