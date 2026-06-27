-- Tenancy root + structure tables, with Postgres RLS on tenant-scoped tables.

CREATE TABLE IF NOT EXISTS societies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS towers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  tower_id uuid NOT NULL REFERENCES towers(id) ON DELETE CASCADE,
  flat_no text NOT NULL,
  type text NOT NULL,
  carpet_area numeric NOT NULL
);

CREATE INDEX IF NOT EXISTS towers_society_id_idx ON towers (society_id);
CREATE INDEX IF NOT EXISTS units_society_id_idx ON units (society_id);
CREATE INDEX IF NOT EXISTS units_tower_id_idx ON units (tower_id);

-- Row-Level Security: rows are only visible/writable when they match the
-- tenant set on the current transaction via SET LOCAL app.current_society_id.
-- FORCE is required because the app connects as a privileged role in this
-- project's current setup; without FORCE, table owners bypass RLS entirely.

ALTER TABLE towers ENABLE ROW LEVEL SECURITY;
ALTER TABLE towers FORCE ROW LEVEL SECURITY;

-- nullif is required because Postgres custom GUC placeholders reset to ''
-- (not NULL) once a SET LOCAL transaction ends; casting '' to uuid throws.
DROP POLICY IF EXISTS towers_tenant_isolation ON towers;
CREATE POLICY towers_tenant_isolation ON towers
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_tenant_isolation ON units;
CREATE POLICY units_tenant_isolation ON units
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- Application runtime role: deliberately NOT a superuser and without
-- BYPASSRLS, because Postgres superusers bypass RLS unconditionally even on
-- FORCE'd tables. The app (and tests proving tenant isolation) must connect
-- as this role for RLS to mean anything; migrations still run as the admin
-- role since they need DDL privileges this role doesn't have.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_user_dev_password';
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON societies, towers, units TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
