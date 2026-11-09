"""Small in-process sliding-window rate limiter.

Adequate for a single API instance / demo. For multi-instance deployments swap the
backend for Redis (same interface) - see docs/DEPLOYMENT.md.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .config import get_settings


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int, window_s: int) -> tuple[bool, int]:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                retry = int(window_s - (now - q[0])) + 1
                return False, retry
            q.append(now)
            return True, 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd and get_settings().trust_proxy:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce(request: Request, bucket: str, limit: int, window_s: int) -> None:
    ok, retry = limiter.hit(f"{bucket}:{client_ip(request)}", limit, window_s)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Please try again in {retry} seconds.",
            headers={"Retry-After": str(retry)},
        )
