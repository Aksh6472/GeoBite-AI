"""Data-retention maintenance. Run daily (cron / scheduled job):

    python -m app.maintenance purge [--dry-run]

* Deletes community photos older than RETENTION_PHOTO_DAYS.
* Clears IP hashes older than RETENTION_IP_HASH_DAYS (they are only needed for short-term spam
  protection and de-duplication).
"""
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import CommunityReport
from .services import audit


def purge(dry_run: bool = False) -> dict:
    s = get_settings()
    now = datetime.now(timezone.utc)
    photos = ips = 0
    with SessionLocal() as db:
        for r in db.scalars(select(CommunityReport).where(CommunityReport.photo_path.isnot(None), CommunityReport.created_at < now - timedelta(days=s.retention_photo_days))):
            photos += 1
            if not dry_run:
                (Path(s.upload_dir) / r.photo_path).unlink(missing_ok=True)
                r.photo_path = None
        for r in db.scalars(select(CommunityReport).where(CommunityReport.ip_hash.isnot(None), CommunityReport.created_at < now - timedelta(days=s.retention_ip_hash_days))):
            ips += 1
            if not dry_run:
                r.ip_hash = None
        if not dry_run:
            audit.log(db, actor=None, action="retention_purge", entity_type="community_report", entity_id=None, changes={"photos": photos, "ip_hashes": ips})
            db.commit()
    return {"photos_removed": photos, "ip_hashes_cleared": ips, "dry_run": dry_run}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["purge"])
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    print(purge(a.dry_run))
