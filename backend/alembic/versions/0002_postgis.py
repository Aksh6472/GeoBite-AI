"""PostGIS geometry columns, sync triggers and spatial indexes (PostgreSQL only)

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

POINT_TABLES = ["bite_incidents", "community_reports", "hospitals", "veterinary_inspections"]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite fallback uses lat/lng columns with haversine in Python
    available = bind.exec_driver_sql("SELECT 1 FROM pg_available_extensions WHERE name='postgis'").first()
    if not available:
        print("PostGIS not available on this server: skipping geometry columns (Python spatial fallback will be used)")
        return
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION geobite_sync_point() RETURNS trigger AS $$
        BEGIN
          IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
            NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
          ELSE
            NEW.geom := NULL;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        """
    )
    for t in POINT_TABLES:
        op.execute(f"ALTER TABLE {t} ADD COLUMN geom geometry(Point, 4326)")
        op.execute(f"UPDATE {t} SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL")
        op.execute(f"CREATE INDEX ix_{t}_geom ON {t} USING GIST (geom)")
        op.execute(f"CREATE TRIGGER trg_{t}_geom BEFORE INSERT OR UPDATE OF latitude, longitude ON {t} FOR EACH ROW EXECUTE FUNCTION geobite_sync_point()")

    op.execute("ALTER TABLE geographical_locations ADD COLUMN centroid geometry(Point, 4326)")
    op.execute("ALTER TABLE geographical_locations ADD COLUMN boundary_geom geometry(Polygon, 4326)")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION geobite_sync_area() RETURNS trigger AS $$
        BEGIN
          NEW.centroid := ST_SetSRID(ST_MakePoint(NEW.centroid_lng, NEW.centroid_lat), 4326);
          IF NEW.boundary_geojson IS NOT NULL THEN
            NEW.boundary_geom := ST_SetSRID(ST_GeomFromGeoJSON(NEW.boundary_geojson::text), 4326);
          ELSE
            NEW.boundary_geom := NULL;
          END IF;
          RETURN NEW;
        END; $$ LANGUAGE plpgsql;
        """
    )
    op.execute("CREATE TRIGGER trg_geo_sync BEFORE INSERT OR UPDATE ON geographical_locations FOR EACH ROW EXECUTE FUNCTION geobite_sync_area()")
    op.execute("CREATE INDEX ix_geo_boundary ON geographical_locations USING GIST (boundary_geom)")
    op.execute("CREATE INDEX ix_geo_centroid ON geographical_locations USING GIST (centroid)")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql" or not bind.exec_driver_sql("SELECT 1 FROM pg_extension WHERE extname='postgis'").first():
        return
    op.execute("DROP TRIGGER IF EXISTS trg_geo_sync ON geographical_locations")
    op.execute("ALTER TABLE geographical_locations DROP COLUMN IF EXISTS boundary_geom, DROP COLUMN IF EXISTS centroid")
    for t in POINT_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS trg_{t}_geom ON {t}")
        op.execute(f"ALTER TABLE {t} DROP COLUMN IF EXISTS geom")
    op.execute("DROP FUNCTION IF EXISTS geobite_sync_point()")
    op.execute("DROP FUNCTION IF EXISTS geobite_sync_area()")
