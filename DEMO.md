# MySociety — live demo access

Railway project `parkview1`. Deployed from `gargpr25/MySociety` (branch `devin/1786911800-fix-railway-build`, PR #15).
All three services verified healthy and the database is seeded with synthetic demo data.

## Live URLs

| Service | URL |
|---------|-----|
| Admin console | https://mysocietyadmin-production.up.railway.app |
| Resident PWA | https://mysocietyresident-production.up.railway.app |
| API | https://mysocietyapi-production.up.railway.app |
| API health | https://mysocietyapi-production.up.railway.app/health → `{"status":"ok"}` |

## Credentials

There are **no passwords** — both apps use one-time codes (`SMS_PROVIDER=console`), so the code is
printed in the API service logs instead of being sent by SMS/email.

| Role | Identifier | Notes |
|------|------------|-------|
| Society admin | `admin@seed-society.test` | Lands on `/units` (500 seeded units) |
| Resident (owner) | `9810000001` | Asha Sharma, Tower 1 flat 101, 6 bills of ₹4172 |
| Resident (owner) | `9810000002` | Vikram Mehta, Tower 2 flat 201 |
| Resident (tenant) | `9810000003` | Priya Nair, Tower 2 flat 203 |

### Getting the OTP code

1. Enter the identifier on the app's login page and submit — this triggers the code.
2. Railway dashboard → project `parkview1` → **api** service → **Deploy Logs**, and look for the
   newest line:

   ```
   [sms] OTP for admin@seed-society.test: 123456
   ```

3. Type that 6-digit code into the app. Codes are short-lived, so re-request if it fails.

CLI alternative (needs a Railway project token):

```sh
curl -s https://backboard.railway.com/graphql/v2 \
  -H "Project-Access-Token: $RAILWAY_TOKEN" -H 'content-type: application/json' \
  -d '{"query":"query{deploymentLogs(deploymentId:\"661a5c9a-32e4-4297-ba1f-492f470e70bd\",limit:20,filter:\"sms\"){message}}"}'
```

The header must be `Project-Access-Token`, not `Authorization: Bearer`. The newest log line is **last**
in the returned array. If the deployment id above is stale, take the api service's current deployment
id from the Railway dashboard.

## Railway identifiers

| Thing | Id |
|-------|-----|
| Project `parkview1` | `132d746b-cce5-4399-8519-78cc0f8f0829` |
| Environment `production` | `e2278bf7-294e-4fb9-84c0-eecd8f4a01ba` |
| api service | `83050e9c-1d61-419d-8cde-826ec4d4c11c` |
| admin service | `306121db-f244-4e68-a71c-cff26a6cc89e` |
| resident service | `192c89c3-8fc2-40fb-a246-ce17d8ea83ec` |
| Postgres service | `b1b84a11-7322-4f6e-a210-4a0ac386abcb` |

Database credentials are **not** listed here on purpose — read them from the Railway
service variables (`ADMIN_DATABASE_URL` / `DATABASE_URL` on the api service, `POSTGRES_PASSWORD`
on the Postgres service). The api connects as superuser for migrations and as the restricted
`app_user` role for tenant traffic, which is what Postgres RLS relies on.

## What is in the demo data

Society **Seed Society**:

- 500 units across towers, ~2660 residents
- 4 bill heads; 6 billing cycles `2026-01`…`2026-06` (`2026-06` DRAFT, `2026-05` PUBLISHED, rest CLOSED)
- 2500 bills — cycle `2026-05` totals ₹3,192,987 due, 46.6% collected
- No tickets, bookings or notices are seeded — create those from the admin console to demo them

Demo dates live in 2026, so notices and cycles show 2026 timestamps.

## Suggested demo script

1. **Admin**: log in → `/units`, search a flat number, open a unit (type, carpet area, parking).
2. **Admin billing**: open cycle `2026-05` → 500 bills with real ₹ amounts and collection %.
   On DRAFT `2026-06`, `Generate…` shows a non-destructive estimate. Avoid
   `Generate Bills for N Units` / `Confirm & Publish` unless you want to churn the demo data.
3. **Admin**: publish a notice, and create an amenity resource (e.g. "Clubhouse").
4. **Resident** (`9810000001`): the notice appears immediately; `Bills` shows only that unit's
   6 bills (tenant isolation), and a bill opens into its line items (maintenance, water, sewer,
   electricity + tax).
5. **Resident**: book a slot on the new amenity → shows `confirmed`, and the booking appears in the
   admin `Bookings` view.

Two rough edges to steer around when presenting:

- Admin unit detail shows resident **Name/Mobile as `—`** (known bug: the query filters
  `residents.unitId` while the seed links residents through the `unit_residents` join table).
- The resident booking form wants a raw **unit UUID** — copy it from the admin unit URL
  (`/units/<uuid>`) before demoing a booking.

## Keeping the deploy working

PR #15 carries the config that makes these builds pass (corepack/pnpm collision, repo-root-relative
paths, workspace dependency build order, `HOSTNAME=0.0.0.0` for the Next standalone servers). Until
it merges into `main`, a deploy triggered from `main` will fail again.
