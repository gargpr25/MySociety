-- Payments: audit_log, society_bank_accounts, payments, payment_allocations,
-- gateway_events. Extends societies with razorpay_linked_account_id.
-- audit_log and gateway_events are NOT tenant-scoped via RLS (cross-tenant by design).

ALTER TABLE societies ADD COLUMN IF NOT EXISTS razorpay_linked_account_id text;

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid REFERENCES societies(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_kind text NOT NULL CHECK (actor_kind IN ('admin', 'resident', 'system')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS society_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  account_name text NOT NULL,
  account_number_last4 text NOT NULL,
  account_number_encrypted text NOT NULL,
  ifsc text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'pending_approval', 'approved', 'rejected')),
  razorpay_linked_account_id text,
  approved_by uuid REFERENCES admin_users(id),
  approved_at timestamptz,
  rejection_reason text,
  created_by uuid NOT NULL REFERENCES admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES residents(id),
  provider text NOT NULL DEFAULT 'fake',
  provider_order_id text NOT NULL,
  provider_payment_id text,
  amount_paise bigint NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'captured', 'failed', 'refunded')),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gateway_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS payments_society_id_idx ON payments (society_id);
CREATE INDEX IF NOT EXISTS payments_provider_order_id_idx ON payments (provider_order_id);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments (status, created_at);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_bill_id_idx ON payment_allocations (bill_id);
CREATE INDEX IF NOT EXISTS audit_log_society_id_idx ON audit_log (society_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS society_bank_accounts_society_id_idx ON society_bank_accounts (society_id);

-- RLS on tenant-scoped tables
ALTER TABLE society_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE society_bank_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS society_bank_accounts_tenant_isolation ON society_bank_accounts;
CREATE POLICY society_bank_accounts_tenant_isolation ON society_bank_accounts
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
CREATE POLICY payments_tenant_isolation ON payments
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocations_tenant_isolation ON payment_allocations;
CREATE POLICY payment_allocations_tenant_isolation ON payment_allocations
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- audit_log: no RLS — written cross-tenant by the system
-- gateway_events: no RLS — global event log, not tenant-scoped

GRANT SELECT, INSERT, UPDATE, DELETE
  ON society_bank_accounts, payments, payment_allocations, audit_log, gateway_events
  TO app_user;
