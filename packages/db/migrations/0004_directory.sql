-- Resident directory expansion: unit_residents (many-to-many between units
-- and residents, supports landlords owning multiple units) and parking_spots
-- inventory. Also adds the unique constraints CSV import / bulk-seed
-- find-or-create logic needs to stay idempotent.

CREATE TABLE IF NOT EXISTS unit_residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('owner', 'tenant', 'family')),
  is_primary boolean NOT NULL DEFAULT false,
  can_pay boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parking_spots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  spot_no text NOT NULL,
  type text NOT NULL DEFAULT 'car',
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  is_rentable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS unit_residents_society_id_idx ON unit_residents (society_id);
CREATE INDEX IF NOT EXISTS unit_residents_unit_id_idx ON unit_residents (unit_id);
CREATE INDEX IF NOT EXISTS unit_residents_resident_id_idx ON unit_residents (resident_id);
CREATE UNIQUE INDEX IF NOT EXISTS unit_residents_unit_id_resident_id_key ON unit_residents (unit_id, resident_id);

CREATE INDEX IF NOT EXISTS parking_spots_society_id_idx ON parking_spots (society_id);
CREATE INDEX IF NOT EXISTS parking_spots_unit_id_idx ON parking_spots (unit_id);
CREATE UNIQUE INDEX IF NOT EXISTS parking_spots_society_id_spot_no_key ON parking_spots (society_id, spot_no);

-- Needed for idempotent bulk find-or-create at directory scale (CSV import,
-- seed expansion): a flat number is unique within its tower, a mobile is
-- unique within its society (a landlord with multiple units gets one
-- residents row, linked to many units via unit_residents, not one row per
-- unit).
CREATE UNIQUE INDEX IF NOT EXISTS units_tower_id_flat_no_key ON units (tower_id, flat_no);
CREATE UNIQUE INDEX IF NOT EXISTS residents_society_id_mobile_key ON residents (society_id, mobile);

-- Row-Level Security, same nullif(...)::uuid pattern as every other
-- tenant-scoped table. See 0001_init.sql for why nullif is required.

ALTER TABLE unit_residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_residents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_residents_tenant_isolation ON unit_residents;
CREATE POLICY unit_residents_tenant_isolation ON unit_residents
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE parking_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE parking_spots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_spots_tenant_isolation ON parking_spots;
CREATE POLICY parking_spots_tenant_isolation ON parking_spots
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON unit_residents, parking_spots TO app_user;
