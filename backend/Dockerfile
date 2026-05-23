FROM python:3.12-slim

WORKDIR /app

# System deps for asyncpg (C extension)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

COPY . .

CMD ["uvicorn", "sovereign_health.main:app", "--host", "0.0.0.0", "--port", "8000"]
