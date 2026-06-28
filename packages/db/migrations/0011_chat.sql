-- chat_sessions: one active session per resident, tracks chatbot conversation context
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL,
  resident_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_sessions_tenant ON chat_sessions
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_sessions TO app_user;

-- chat_messages: individual messages within a session (role: user | bot)
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_tenant ON chat_messages
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON chat_messages TO app_user;
