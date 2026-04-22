# syntax=docker/dockerfile:1.7
# Python 3.11 ingest service. Build từ root monorepo.
#   docker build -f apps/ingest/Dockerfile -t locallife-ingest .

FROM python:3.11-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY apps/ingest/pyproject.toml ./pyproject.toml
RUN pip install --no-cache-dir -e ".[dev]" || pip install --no-cache-dir -e .

COPY apps/ingest/app ./app
COPY apps/ingest/README.md ./README.md

RUN useradd -r -u 1001 -g root ingest && chown -R ingest:root /app
USER ingest

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
