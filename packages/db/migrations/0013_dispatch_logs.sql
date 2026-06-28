-- dispatch_logs: records every connector dispatch attempt
CREATE TABLE dispatch_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    UUID NOT NULL,
  integration_id UUID NOT NULL,
  event_type    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  attempt_count INT NOT NULL DEFAULT 1,
  payload       JSONB NOT NULL DEFAULT '{}',
  response_body TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX dispatch_logs_integration_id_idx ON dispatch_logs (integration_id, created_at DESC);
CREATE INDEX dispatch_logs_society_id_idx ON dispatch_logs (society_id);

ALTER TABLE dispatch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispatch_logs_tenant_isolation ON dispatch_logs
  USING (society_id = current_setting('app.current_society_id', true)::uuid);

GRANT SELECT, INSERT ON dispatch_logs TO app_user;
