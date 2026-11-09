#!/bin/sh
set -e
cd /app/backend
echo "[geobite] applying database migrations"
alembic upgrade head
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[geobite] seeding synthetic demo data if the database is empty"
  python seed.py || echo "[geobite] seed skipped/failed (see log above)"
fi
echo "[geobite] starting API on 127.0.0.1:8000"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1 &
API_PID=$!
cd /app/web
echo "[geobite] starting web on 0.0.0.0:${PORT}"
node server.js &
WEB_PID=$!
# Exit (so the platform restarts the container) if either process dies.
while kill -0 $API_PID 2>/dev/null && kill -0 $WEB_PID 2>/dev/null; do sleep 5; done
echo "[geobite] a process exited; stopping container"
kill $API_PID $WEB_PID 2>/dev/null || true
exit 1
