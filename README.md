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

The repo includes per-app `railway.toml` and `railpack.json` files that
configure the three services on [Railway](https://railway.com).

### One-time project setup

1. Create a new Railway project and connect it to this GitHub repo.

2. Add a **PostgreSQL** database service (Railway auto-injects `DATABASE_URL`).

3. Create three services — **api**, **admin**, **resident** — each pointing at
   this repo. For each service, set **Root Directory** in Settings:

   | Service | Root Directory |
   |---------|----------------|
   | api | `apps/api` |
   | admin | `apps/admin` |
   | resident | `apps/resident` |

4. Set environment variables on the **api** service:

   | Variable | Value |
   |----------|-------|
   | `DATABASE_URL` | Auto-injected by Railway Postgres plugin |
   | `JWT_SECRET` | Random string ≥ 16 chars |
   | `INTEGRATION_ENCRYPTION_KEY` | 64 hex chars — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `NODE_ENV` | `production` |

5. Set on **admin** and **resident** services:

   | Variable | Value |
   |----------|-------|
   | `API_URL` | Internal URL of the api service (e.g. `https://api-mysociety.up.railway.app`) |
   | `NODE_ENV` | `production` |

6. Deploy. The api service runs migrations automatically on startup — no manual
   migration step required.

7. (Optional) Seed synthetic data as a one-off job:

   ```sh
   # From Railway dashboard: api service → Run command
   SEED_ENABLED=true node -e "import('./dist/seed-runner.js')"
   ```
