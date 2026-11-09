# syntax=docker/dockerfile:1
# Single-container image for cloud hosting (Render, Fly, Railway, any Docker host):
# Next.js serves the UI on $PORT and proxies /api/* to FastAPI on 127.0.0.1:8000.
# Build context: repository root.

FROM node:22-slim AS web
WORKDIR /web
ENV NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_URL=http://127.0.0.1:8000
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=node:22-slim /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install --timeout 180 --retries 10 -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /web/.next/standalone web/
COPY --from=web /web/.next/static web/.next/static
COPY --from=web /web/public web/public
COPY deploy/start.sh start.sh
RUN useradd -m geobite && mkdir -p backend/uploads && chown -R geobite /app && chmod +x start.sh
USER geobite
EXPOSE 10000
CMD ["./start.sh"]
