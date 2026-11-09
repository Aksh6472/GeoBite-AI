"""Geospatial helpers: distance, ward resolution, privacy snapping, unique codes."""
import math
import secrets
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import has_postgis
from ..models import GeoLocation

settings = get_settings()
EARTH_R = 6_371_008.8
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I


def new_code(prefix: str, n: int = 6, with_year: bool = True) -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(n))
    return f"{prefix}-{datetime.now(timezone.utc).year}-{body}" if with_year else f"{prefix}-{body}"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def point_in_polygon(lat: float, lng: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def resolve_ward(db: Session, lat: float, lng: float, max_km: float = 6.0) -> GeoLocation | None:
    """Find the ward containing a point (PostGIS ST_Contains when available), else the nearest
    ward centroid within `max_km`."""
    if has_postgis():
        row = db.execute(
            text(
                "SELECT id FROM geographical_locations WHERE level='ward' AND boundary_geom IS NOT NULL "
                "AND ST_Contains(boundary_geom, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)) LIMIT 1"
            ),
            {"lat": lat, "lng": lng},
        ).first()
        if row:
            return db.get(GeoLocation, row[0])
    wards = db.scalars(select(GeoLocation).where(GeoLocation.level == "ward")).all()
    for w in wards:
        if w.boundary_geojson and point_in_polygon(lat, lng, w.boundary_geojson["coordinates"][0]):
            return w
    best, best_d = None, max_km * 1000
    for w in wards:
        d = haversine_m(lat, lng, w.centroid_lat, w.centroid_lng)
        if d < best_d:
            best, best_d = w, d
    return best


def ancestors(ward: GeoLocation) -> dict[str, GeoLocation]:
    out: dict[str, GeoLocation] = {}
    node: GeoLocation | None = ward
    while node is not None:
        out[node.level] = node
        node = node.parent
    return out


def snap(lat: float, lng: float, grid: float | None = None) -> tuple[float, float]:
    """Snap a coordinate to the centre of a privacy grid cell (~550 m by default)."""
    g = grid or settings.public_grid_deg
    return (math.floor(lat / g) * g + g / 2, math.floor(lng / g) * g + g / 2)


def hexagon(lat: float, lng: float, radius_m: float) -> dict:
    """Synthetic demo ward boundary: a hexagon around the ward centroid (GeoJSON Polygon)."""
    dlat = radius_m / 111_320
    dlng = radius_m / (111_320 * math.cos(math.radians(lat)))
    ring = [[round(lng + dlng * math.cos(math.radians(a)), 6), round(lat + dlat * math.sin(math.radians(a)), 6)] for a in range(0, 360, 60)]
    ring.append(ring[0])
    return {"type": "Polygon", "coordinates": [ring]}
