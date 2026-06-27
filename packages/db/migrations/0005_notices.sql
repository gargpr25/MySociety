-- Notice board: society-scoped announcements with audience targeting,
-- publish/expiry windows, and pinning. Attachments table is polymorphic
-- (entity_type + entity_id) so future entities can reuse it without
-- adding per-entity foreign key columns.

CREATE TABLE IF NOT EXISTS notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'owners', 'tenants')),
  pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  url text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notices_society_id_idx ON notices (society_id);
CREATE INDEX IF NOT EXISTS notices_publish_at_idx ON notices (society_id, publish_at DESC);

CREATE INDEX IF NOT EXISTS attachments_society_id_idx ON attachments (society_id);
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON attachments (entity_type, entity_id);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notices_tenant_isolation ON notices;
CREATE POLICY notices_tenant_isolation ON notices
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attachments_tenant_isolation ON attachments;
CREATE POLICY attachments_tenant_isolation ON attachments
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON notices, attachments TO app_user;
