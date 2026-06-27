
```markdown
# AGENTS.md — mySociety

## What this project is
A multi-tenant SaaS platform connecting residents of gated societies with their
administration for billing, collections, complaints/requests, notices, and
amenity/parking allocation. It is NOT a visitor-entry/gate app. Core value:
reduce maintenance defaults and replace the reconciliation spreadsheet.

## Non-negotiable conventions
1. **Multi-tenancy:** Every tenant-scoped table has a `society_id` (uuid) column.
   Postgres Row-Level Security (RLS) isolates tenants. Tenant context is set per
   request from the authenticated session — never trusted from client input.
2. **No demo code paths:** The application reads only from the real database via
   real repositories. There must be ZERO `if (demo)` / mock-data branches in
   service or route code. Synthetic data exists only as seeded rows in
   `packages/seed`, gated behind a `SEED_ENABLED` env flag and a CLI command.
3. **External systems behind interfaces:** SMS/OTP and payments are defined as
   interfaces with a real implementation and a fake implementation. Tests and
   local dev use the fakes. Real provider keys come from env only.
4. **TypeScript everywhere.** Strict mode on. No `any` without justification.
5. **Tests are mandatory.** Every task adds/updates tests and they must pass
   before a PR is opened.

## Stack (do not substitute without being asked)
- Monorepo: pnpm + Turborepo
- API: Fastify (TypeScript), modular monolith
- DB: PostgreSQL + Drizzle ORM, with RLS
- Admin web: Next.js (App Router)
- Resident app: Next.js PWA (installable, mobile-first)
- Jobs/queue: BullMQ + Redis
- Tests: Vitest; API integration tests use a real Postgres (docker-compose)
- Validation: zod for all external input and env parsing
- Lint/format: eslint + prettier

## Repository layout
```
apps/
  api/        # Fastify backend
  admin/      # Next.js admin console
  resident/   # Next.js resident PWA
packages/
  db/         # Drizzle schema, migrations, RLS policies, repositories
  seed/       # deterministic synthetic data generator (idempotent)
  types/      # shared TypeScript types / zod schemas
  config/     # env parsing/validation, shared config
```

## Commands
- Install: `pnpm install`
- Build: `pnpm build`
- Test: `pnpm test`
- DB up (local): `docker compose up -d db redis`
- Migrate: `pnpm --filter @mysociety/db migrate`
- Seed (dev only): `SEED_ENABLED=true pnpm --filter @mysociety/seed run seed`

## Roles (RBAC)
platform_super_admin, society_admin, society_accountant, facility_manager,
resident_owner, resident_tenant, resident_family. Enforce at API layer AND via RLS.

## What NOT to build
- No visitor management / gate passes / guard app.
