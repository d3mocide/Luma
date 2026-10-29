FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg (C extension)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install from the hash-pinned lock so the image runs exactly what CI tested;
# pyproject alone leaves every transitive dep to resolve at build time.
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock \
    && pip install --no-cache-dir --no-deps -e .

COPY . .

CMD ["uvicorn", "luma.main:app", "--host", "0.0.0.0", "--port", "8000"]
