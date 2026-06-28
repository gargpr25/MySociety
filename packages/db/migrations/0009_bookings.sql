-- bookable_resources: amenity slots (playground, clubhouse, etc.)
CREATE TABLE IF NOT EXISTS bookable_resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid NOT NULL,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  capacity    integer NOT NULL DEFAULT 1,
  slot_rules  jsonb NOT NULL DEFAULT '{}',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookable_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookable_resources_tenant ON bookable_resources
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- bookings: confirmed slot reservations with overlap prevention
CREATE TABLE IF NOT EXISTS bookings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid NOT NULL,
  resource_id uuid NOT NULL REFERENCES bookable_resources(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL,
  booked_by   uuid NOT NULL,
  slot_start  timestamptz NOT NULL,
  slot_end    timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_tenant ON bookings
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- parking_allocations: records which unit holds which spot for a period
-- rent_amount = 0 for owned spots; > 0 triggers a bill when cycleId provided
CREATE TABLE IF NOT EXISTS parking_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid NOT NULL,
  spot_id     uuid NOT NULL REFERENCES parking_spots(id) ON DELETE CASCADE,
  unit_id     uuid NOT NULL,
  period      text NOT NULL,
  rent_amount numeric(12,2) NOT NULL DEFAULT 0,
  bill_id     uuid,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parking_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY parking_allocations_tenant ON parking_allocations
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON bookable_resources, bookings, parking_allocations TO app_user;
