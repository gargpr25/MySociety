-- integration_configs: per-society connector configuration with encrypted credentials
CREATE TABLE IF NOT EXISTS integration_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL,
  connector_type text NOT NULL,
  encrypted_credentials text NOT NULL DEFAULT '',
  field_mappings jsonb NOT NULL DEFAULT '{}',
  enabled_events jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_configs_tenant ON integration_configs
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON integration_configs TO app_user;
