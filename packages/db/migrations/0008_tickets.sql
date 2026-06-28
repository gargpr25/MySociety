-- tickets: unified complaints + service requests
CREATE TABLE IF NOT EXISTS tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id      uuid NOT NULL,
  unit_id         uuid,
  raised_by       uuid NOT NULL,
  type            text NOT NULL CHECK (type IN ('complaint', 'request')),
  category        text NOT NULL,
  description     text NOT NULL,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','assigned','in_progress','resolved','closed','reopened')),
  priority        text NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to     uuid,
  sla_due_at      timestamptz,
  sla_breached    boolean NOT NULL DEFAULT false,
  channel         text NOT NULL DEFAULT 'app' CHECK (channel IN ('app','admin')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tickets_tenant ON tickets
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

-- ticket_events: status transitions, assignments, comments
CREATE TABLE IF NOT EXISTS ticket_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid NOT NULL,
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id    uuid,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('resident','admin','system')),
  event_type  text NOT NULL CHECK (event_type IN ('created','status_change','assigned','comment')),
  old_value   text,
  new_value   text,
  body        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_events_tenant ON ticket_events
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON tickets, ticket_events TO app_user;
