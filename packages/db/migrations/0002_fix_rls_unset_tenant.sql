-- Postgres custom GUCs (like app.current_society_id) are placeholders until
-- first set; their reset value after a transaction's SET LOCAL ends is an
-- empty string, not NULL, even though current_setting(name, true) on a
-- never-touched session returns NULL. Casting '' to uuid throws instead of
-- producing no match, so RLS policies must strip the empty string via
-- nullif before casting.

DROP POLICY IF EXISTS towers_tenant_isolation ON towers;
CREATE POLICY towers_tenant_isolation ON towers
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);

DROP POLICY IF EXISTS units_tenant_isolation ON units;
CREATE POLICY units_tenant_isolation ON units
  USING (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid)
  WITH CHECK (society_id = nullif(current_setting('app.current_society_id', true), '')::uuid);
