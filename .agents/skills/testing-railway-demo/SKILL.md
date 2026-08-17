---
name: testing-railway-demo
description: How to exercise the deployed mySociety demo (admin console, resident PWA, API) end-to-end through the UI, including OTP login without a phone/email, seeded data landmarks, and gotchas in create-flows.
---

# Testing the deployed mySociety demo

## Environments
- Admin console: `https://mysocietyadmin-production.up.railway.app`
- Resident PWA:  `https://mysocietyresident-production.up.railway.app`
- API:           `https://mysocietyapi-production.up.railway.app` (`/health` → `{"status":"ok"}`)

Both frontends call the API through a same-origin `/api/*` rewrite whose target is baked in at build
time (`API_URL`). A wrong value breaks only client-side calls, so always assert on *live data*
(counts, ₹ amounts) rather than on the page shell rendering.

## Logging in (OTP only, SMS_PROVIDER=console)
OTP codes are printed to the API service stdout and are readable from Railway deployment logs.
Newest entry is **last** in the returned array.

```
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $RAILWAY_TOKEN" -H 'content-type: application/json' \
  -d '{"query":"query{deploymentLogs(deploymentId:\"<API_DEPLOYMENT_ID>\",limit:20,filter:\"sms\"){message}}"}'
```
Note the header is `Project-Access-Token`, **not** `Authorization: Bearer`.
If the deployment id changed, list deployments for project `132d746b-cce5-4399-8519-78cc0f8f0829`,
environment `e2278bf7-294e-4fb9-84c0-eecd8f4a01ba`, service `83050e9c-1d61-419d-8cde-826ec4d4c11c`.

Identities: admin `admin@seed-society.test` (admin `/login` → lands on `/units`);
residents `9810000001` (Asha Sharma, flat 101), `9810000002`, `9810000003` (resident `/login` → `/notices`).

### Devin Secrets Needed
- `RAILWAY_TOKEN` — Railway project access token, used only to read OTP codes from deployment logs.

## Seeded data landmarks (useful assertions)
- 500 units (`Units (500)` heading), ~2660 residents, 6 billing cycles `2026-01`…`2026-06`
  (`2026-06` is DRAFT, `2026-05` PUBLISHED, rest CLOSED), 2500 bills, 4 bill heads.
- Resident 9810000001 → flat 101, 6 bills of ₹4172.00 each (good tenant/unit-scoping check:
  the resident list must be ~6 items, never hundreds).
- No bookable resources, tickets or bookings are seeded — create-flows must create them first.

## Gotchas
- The resident booking form asks for a raw **Unit UUID**; there is no picker. Get it from the admin
  app: `/units` → search the flat number → the `View →` link URL is `/units/<unit-uuid>`.
- `datetime-local` inputs: click the month segment, then type `MM`, `DD`, `YYYY`, press `Right`,
  then `hh`, `mm`, `A`. Typing the year immediately followed by the hour overflows into the year
  segment (`202610`); `ctrl+a` inside the field selects the whole page instead of the field.
- Billing: `Generate…` shows a non-destructive estimate panel; `Review & Publish` shows a preview.
  Avoid `Generate Bills for N Units` / `Confirm & Publish` on the demo unless data churn is wanted.
- Known bug (unrelated to deploy config): admin unit detail shows resident Name/Mobile as `—`,
  because `listResidentsByUnitId` filters `residents.unitId` while the seed/CSV importer links
  residents through the `unit_residents` join table. Expect this until the query is fixed.
- The demo DB clock/dates live in 2026; notices are stamped with 2026 dates — not a bug.
