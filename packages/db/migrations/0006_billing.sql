-- Billing engine: bill_heads (configurable compute rules), meter_readings,
-- billing_cycles, bills, bill_line_items. All tenant-scoped with RLS.
-- Tax is configurable per line item via tax_rule jsonb — no hardcoded GST.

CREATE TABLE IF NOT EXISTS bill_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  name text NOT NULL,
  compute_rule text NOT NULL CHECK (compute_rule IN ('fixed', 'per_sqft', 'metered', 'flat_per_unit')),
  rate numeric(14,4) NOT NULL DEFAULT 0,
  tax_rule jsonb NOT NULL DEFAULT '{"type":"none"}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  head_id uuid NOT NULL REFERENCES bill_heads(id) ON DELETE CASCADE,
  period text NOT NULL,
  prev_reading numeric(14,2) NOT NULL DEFAULT 0,
  current_reading numeric(14,2) NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  period text NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  late_fee_rule jsonb NOT NULL DEFAULT '{"type":"none"}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES billing_cycles(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid', 'overdue')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  arrears_carry_forward numeric(14,2) NOT NULL DEFAULT 0,
  total_due numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  head_id uuid NOT NULL REFERENCES bill_heads(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric(14,4) NOT NULL DEFAULT 1,
  rate numeric(14,4) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0
);

-- Unique constraints for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS billing_cycles_society_period_key ON billing_cycles (society_id, period);
CREATE UNIQUE INDEX IF NOT EXISTS bills_unit_cycle_key ON bills (unit_id, cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS meter_readings_unit_head_period_key ON meter_readings (unit_id, head_id, period);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS bill_heads_society_id_idx ON bill_heads (society_id);
CREATE INDEX IF NOT EXISTS meter_readings_society_id_idx ON meter_readings (society_id);
CREATE INDEX IF NOT EXISTS billing_cycles_society_id_idx ON billing_cycles (society_id, period DESC);
CREATE INDEX IF NOT EXISTS bills_cycle_id_idx ON bills (cycle_id);
CREATE INDEX IF NOT EXISTS bills_unit_id_idx ON bills (unit_id);
CREATE INDEX IF NOT EXISTS bill_line_items_bill_id_idx ON bill_line_items (bill_id);

-- Row-Level Security
ALTER TABLE bill_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_heads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bill_heads_tenant_isolation ON bill_heads;
CREATE POLICY bill_heads_tenant_isolation ON bill_heads
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meter_readings_tenant_isolation ON meter_readings;
CREATE POLICY meter_readings_tenant_isolation ON meter_readings
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_cycles_tenant_isolation ON billing_cycles;
CREATE POLICY billing_cycles_tenant_isolation ON billing_cycles
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bills_tenant_isolation ON bills;
CREATE POLICY bills_tenant_isolation ON bills
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE bill_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_line_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bill_line_items_tenant_isolation ON bill_line_items;
CREATE POLICY bill_line_items_tenant_isolation ON bill_line_items
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON bill_heads, meter_readings, billing_cycles, bills, bill_line_items
  TO app_user;
