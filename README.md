# MySociety

Multi-tenant SaaS platform for managing gated residential societies: billing
(electricity, maintenance, sewer, water, ad-hoc charges), complaints and
requests with SLA tracking, OTP-based resident login, payments, and a
per-society connector framework to external accounting/complaints systems.

See `JULES_PROMPTS.md` for the full task-by-task build spec this repo follows.

## Architecture

pnpm + Turborepo monorepo:

```
apps/
  api/        Fastify (TypeScript) backend
  admin/      Next.js admin console
  resident/   Next.js resident-facing PWA
packages/
  db/         Drizzle ORM schema, SQL migrations, RLS policies, repositories
  seed/       Idempotent synthetic data seed CLI (gated by SEED_ENABLED)
  types/      Shared zod schemas / TS types
  config/     zod-validated environment loading
```

Tenant isolation is enforced with Postgres Row-Level Security. Every
tenant-scoped table carries `society_id`, and a dedicated non-superuser
`app_user` database role (created by the first migration) is required for RLS
to actually take effect — Postgres superusers bypass RLS unconditionally.
Migrations run against `ADMIN_DATABASE_URL` (superuser); the app and seed CLI
run against `DATABASE_URL` (`app_user`, RLS-enforced).

## Prerequisites

- Node.js 22+, pnpm 10+
- PostgreSQL 16 and Redis 7, reachable via the URLs in your `.env`
  (`docker-compose.yml` provides both for local/CI use; any local install works
  too)

## Setup

1. Copy `.env.example` to `.env` and adjust values if needed.
2. Create the database referenced by `DATABASE_URL`/`ADMIN_DATABASE_URL`
   (e.g. `createdb mysociety`).
3. Install dependencies:

   ```sh
   pnpm install
   ```

4. Run migrations (creates tables, RLS policies, and the `app_user` role):

   ```sh
   pnpm --filter @mysociety/db migrate
   ```

5. Seed synthetic data (idempotent — safe to re-run):

   ```sh
   SEED_ENABLED=true pnpm --filter @mysociety/seed run seed
   ```

## Common commands

```sh
pnpm install        # install all workspace dependencies
pnpm build           # build all packages/apps (turbo)
pnpm test            # run all Vitest suites, including RLS cross-tenant tests
pnpm dev             # run all apps in dev mode
```

Tests run against a real Postgres database (no mocked DB layer). The db and
seed test suites default to `postgresql://postgres:postgres@localhost:5432/mysociety_test`
and `postgresql://app_user:app_user_dev_password@localhost:5432/mysociety_test`
unless `TEST_ADMIN_DATABASE_URL` / `TEST_DATABASE_URL` are set, and apply
migrations to that database automatically before asserting tenant isolation.

## Deploying to Railway

Each app ships a `railway.toml` used as Railway's **config-as-code** file, so
build and start commands come from the repo. Every path in those files is
**repo-root relative** — do not set a Root Directory on the services.

### One-time project setup

1. Create a Railway project connected to this GitHub repo.

2. Create three services from this repo and point each one at its config file
   (service Settings → Config-as-code):

   | Service | Config-as-code path |
   |---------|---------------------|
   | api | `apps/api/railway.toml` |
   | admin | `apps/admin/railway.toml` |
   | resident | `apps/resident/railway.toml` |

3. Add a **Postgres** service. The migrations create the non-superuser
   `app_user` role that RLS depends on, so the api needs both a superuser URL
   (for DDL) and an `app_user` URL (for tenant traffic).

4. Set variables on the **api** service (`<pg>` is the Postgres service's
   `RAILWAY_PRIVATE_DOMAIN`, e.g. `postgres.railway.internal`):

   | Variable | Value |
   |----------|-------|
   | `ADMIN_DATABASE_URL` | `postgresql://postgres:<pg-password>@<pg>:5432/railway` |
   | `DATABASE_URL` | `postgresql://app_user:app_user_dev_password@<pg>:5432/railway` |
   | `JWT_SECRET` | random string ≥ 16 chars |
   | `INTEGRATION_ENCRYPTION_KEY` | 64 hex chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |

5. Set on **admin** and **resident**:

   | Variable | Value |
   |----------|-------|
   | `API_URL` | `http://<api-private-domain>:3000` (the Next apps proxy `/api/*` to it; baked in at build time) |
   | `NODE_ENV` | `production` |

6. Deploy. The api runs migrations on startup — no manual migration step.

7. (Optional) Seed synthetic demo data. Expose the Postgres service over a TCP
   proxy and run the seed CLI against it from a checkout:

   ```sh
   SEED_ENABLED=true \
   DATABASE_URL="postgresql://app_user:app_user_dev_password@<proxy-host>:<proxy-port>/railway" \
   pnpm --filter @mysociety/seed run seed
   ```
