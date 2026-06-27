-- Authentication + RBAC: residents, admin_users, roles, permissions, and OTP
-- request tracking.

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS residents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES units(id) ON DELETE SET NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  name text NOT NULL,
  mobile text NOT NULL,
  can_pay boolean NOT NULL DEFAULT true,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- admin_users.society_id is nullable: platform_super_admin accounts are not
-- tied to any single tenant, every other admin role is scoped to one.
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid REFERENCES societies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id),
  email text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  identifier text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS residents_society_id_idx ON residents (society_id);
CREATE INDEX IF NOT EXISTS residents_mobile_idx ON residents (mobile);
CREATE INDEX IF NOT EXISTS admin_users_society_id_idx ON admin_users (society_id);
CREATE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users (email);
CREATE INDEX IF NOT EXISTS otp_requests_identifier_purpose_idx ON otp_requests (identifier, purpose);

-- Row-Level Security, same nullif(...)::uuid pattern as towers/units. See
-- 0001_init.sql / 0002_fix_rls_unset_tenant.sql for why nullif is required.

ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
ALTER TABLE residents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS residents_tenant_isolation ON residents;
CREATE POLICY residents_tenant_isolation ON residents
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- admin_users: platform_super_admin rows carry a NULL society_id and are
-- visible/writable regardless of tenant context; every other admin row is
-- tenant-isolated exactly like residents.
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_tenant_isolation ON admin_users;
CREATE POLICY admin_users_tenant_isolation ON admin_users
  USING (
    society_id IS NULL
    OR society_id = nullif(current_setting('app.current_society_id', true), '')::uuid
  )
  WITH CHECK (
    society_id IS NULL
    OR society_id = nullif(current_setting('app.current_society_id', true), '')::uuid
  );

-- roles, permissions, role_permissions, otp_requests are not tenant-scoped
-- (reference data / pre-auth lookup data), so no RLS is applied to them.

-- Pre-auth lookup problem: resolving which society a mobile/email belongs to
-- must happen *before* any tenant context exists, but RLS on residents/
-- admin_users blocks exactly that read. These SECURITY DEFINER functions are
-- the sole sanctioned cross-tenant read path for auth: narrow, read-only,
-- single-purpose, and granted only to app_user — RLS stays fully enforced
-- everywhere else.
CREATE OR REPLACE FUNCTION find_residents_by_mobile(p_mobile text)
RETURNS SETOF residents
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM residents WHERE mobile = p_mobile;
$$;

CREATE OR REPLACE FUNCTION find_admin_by_email(p_email text)
RETURNS SETOF admin_users
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM admin_users WHERE email = p_email;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON roles, permissions, role_permissions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON residents, admin_users, otp_requests TO app_user;
GRANT EXECUTE ON FUNCTION find_residents_by_mobile(text) TO app_user;
GRANT EXECUTE ON FUNCTION find_admin_by_email(text) TO app_user;

-- Reference data: the seven roles fixed in packages/types/src/auth.ts. Static
-- schema-level data, not synthetic business data, so it belongs in the
-- migration rather than packages/seed.
INSERT INTO roles (name, description) VALUES
  ('platform_super_admin', 'Operates the platform across all societies'),
  ('society_admin', 'Administers a single society'),
  ('society_accountant', 'Manages billing and payments for a society'),
  ('facility_manager', 'Handles tickets, bookings, and facility operations'),
  ('resident_owner', 'Owns a unit in the society'),
  ('resident_tenant', 'Rents a unit in the society'),
  ('resident_family', 'Family member of an owner or tenant')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description) VALUES
  ('manage_society', 'Manage society configuration and onboarding'),
  ('manage_residents', 'Manage resident directory'),
  ('manage_billing', 'Manage bill heads, cycles, and invoices'),
  ('manage_payments', 'View and reconcile payments'),
  ('manage_tickets', 'Manage complaints and requests'),
  ('view_own_bills', 'View own bills and payment history'),
  ('view_own_tickets', 'View and create own tickets'),
  ('pay_bills', 'Make payments against own bills')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE (r.name = 'platform_super_admin')
   OR (r.name = 'society_admin' AND p.name IN (
        'manage_society', 'manage_residents', 'manage_billing', 'manage_payments', 'manage_tickets'
      ))
   OR (r.name = 'society_accountant' AND p.name IN ('manage_billing', 'manage_payments'))
   OR (r.name = 'facility_manager' AND p.name IN ('manage_tickets'))
   OR (r.name IN ('resident_owner', 'resident_tenant', 'resident_family') AND p.name IN (
        'view_own_bills', 'view_own_tickets', 'pay_bills'
      ))
ON CONFLICT DO NOTHING;
