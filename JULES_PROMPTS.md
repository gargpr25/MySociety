# mySociety — Jules Build Prompts

A single, dependency-ordered set of prompts for building the Society Management Platform with **Google Jules** against the GitHub repo **`mySociety`**.

---

## How to use this file

1. **Commit `AGENTS.md` first** (Section A) to the root of `mySociety`. Jules reads it on every task.
2. **Add the environment setup** (Section B) in Jules → *Configure environment* so the VM can install deps and run tests. A Jules VM with no test command will not self-verify before opening a PR — that is the #1 cause of bad PRs.
3. **Run tasks in order (Section C), one at a time.** For each task: paste the prompt, review Jules' plan, approve, then **review and merge the PR before starting the next task.** Each task assumes the previous one is merged into `main`.
4. Do **not** run tasks in parallel. The schema and module dependencies are sequential.

**Hard rules enforced in every task (also in `AGENTS.md`):**
- Multi-tenant from the first migration: `society_id` on every tenant-scoped table + Postgres RLS. No single-tenant shortcuts.
- **No demo branches.** The app always reads real Postgres via real repositories. Synthetic data is seeded rows only — never an `if (demo)` code path.
- External systems (SMS/OTP, Razorpay) sit behind interfaces with fake implementations for dev/test. Real credentials are injected via env, never hardcoded.
- Every task must end with `pnpm install && pnpm build && pnpm test` green, and migrations + seed runnable.

---

## Section A — Commit this as `AGENTS.md` in the repo root

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
- No fund custody. Money settles directly to each society's own bank account via
  Razorpay Route linked accounts. The platform never holds resident funds.
```

---

## Section B — Jules environment setup script

Add this in Jules → **Configure environment** (so the VM installs deps and can self-verify):

```bash
# Environment setup for mySociety
corepack enable
corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile=false

# Start backing services for integration tests
docker compose up -d db redis || true

# Wait for Postgres, then run migrations
until pg_isready -h localhost -p 5432; do sleep 1; done
pnpm --filter @mysociety/db migrate || true
```

Set these environment variables in Jules (dev/fake values — never real secrets):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mysociety
REDIS_URL=redis://localhost:6379
SEED_ENABLED=true
SMS_PROVIDER=console
PAYMENT_PROVIDER=fake
JWT_SECRET=dev-only-not-a-real-secret
```

---

## Section C — Task prompts (run in order)

> Prompt template note: each task is self-contained. Paste exactly one task per Jules run. After the PR is merged, move to the next.

---

### TASK 0 — Scaffold the monorepo and the multi-tenant foundation

```
Read AGENTS.md before planning.

GOAL: Create the project skeleton and the multi-tenant data foundation. No
business features yet. This task exists to establish a self-verifying base that
all later tasks build on.

SCOPE (build exactly this):
1. Initialise a pnpm + Turborepo monorepo with the layout described in AGENTS.md
   (apps/api, apps/admin, apps/resident, packages/db, packages/seed,
   packages/types, packages/config). Pin TypeScript strict mode across all.
2. apps/api: a Fastify server with a GET /health endpoint returning
   { status: "ok" }. Add zod-based env parsing in packages/config.
3. packages/db: set up Drizzle + PostgreSQL. Create the FIRST migration with the
   tenancy root tables ONLY:
   - societies (id uuid pk, name, address jsonb, config jsonb,
     onboarding_status text, created_at, updated_at)
   - towers (id, society_id fk, name)
   - units (id, society_id, tower_id fk, flat_no, type, carpet_area)
   Add a `society_id` column convention and ENABLE Postgres Row-Level Security
   on towers and units, with policies that restrict rows to the current
   `app.current_society_id` setting. societies is the tenant root.
4. Provide a request-scoped mechanism in apps/api to set
   `SET LOCAL app.current_society_id = '<uuid>'` per transaction.
5. docker-compose.yml with postgres + redis services for local/CI.
6. packages/seed: a CLI skeleton (`run seed`) gated by SEED_ENABLED that creates
   ONE society with 2 towers and 10 units. Idempotent (safe to re-run).
7. Vitest set up. Add tests:
   - /health returns ok.
   - RLS test: insert units under society A and society B; with
     app.current_society_id = A, a query returns only A's units (cross-tenant
     read returns zero rows).

NON-GOALS: no auth, no billing, no payments, no UI features beyond a blank
Next.js shell for admin and resident apps. No mock/demo data branches.

ACCEPTANCE CRITERIA:
- `pnpm install && pnpm build && pnpm test` all pass.
- Migrations apply cleanly; seed runs and is idempotent.
- The RLS cross-tenant test passes.
- README documents how to install, migrate, seed, and test.

Open a PR titled "Task 0: monorepo scaffold + multi-tenant foundation".
```

---

### TASK 1 — OTP authentication, sessions, and RBAC

```
Read AGENTS.md. This builds on the merged Task 0.

GOAL: Resident and admin authentication via OTP, sessions, and role-based access
control. SMS is behind an interface with a console fake — do NOT integrate a
real SMS provider.

SCOPE:
1. packages: define an SmsProvider interface { sendOtp(mobile, code) }. Provide
   ConsoleSmsProvider (logs the OTP) selected when SMS_PROVIDER=console.
2. DB migration: residents, admin_users, roles, permissions, and an otp_requests
   table (mobile, code_hash, expires_at, attempts). Add RLS where tenant-scoped.
3. API endpoints:
   - POST /auth/otp/request  (rate-limited; creates+sends OTP)
   - POST /auth/otp/verify   (verifies, issues JWT access + refresh)
   - GET  /me                (returns the authenticated principal)
   - Admin login flow (email + OTP/2FA) issuing an admin session.
4. RBAC middleware enforcing the roles listed in AGENTS.md, plus RLS tenant
   context derived from the session's society_id.
5. Seed: add a few residents and one society_admin to the existing seed society.

NON-GOALS: no real SMS, no directory import yet, no UI beyond minimal login
screens in apps/admin and apps/resident.

ACCEPTANCE CRITERIA:
- Tests: OTP request→verify happy path; expired/invalid OTP rejected; rate limit
  works; an authenticated request resolves the correct society_id; a resident
  cannot access another society's data (RLS).
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 1: OTP auth + sessions + RBAC".
```

---

### TASK 2 — Resident directory and CSV import

```
Read AGENTS.md. Builds on merged Task 1.

GOAL: Model units/residents relationships and let a society_admin bulk-import
resident data via CSV with validation and a dry-run preview.

SCOPE:
1. DB migration:
   - unit_residents (unit_id, resident_id, relationship enum
     [owner|tenant|family], is_primary bool, can_pay bool)
   - parking_spots (society_id, spot_no, type, unit_id nullable, is_rentable)
   All tenant-scoped with RLS.
2. Admin API:
   - POST /admin/residents/import (multipart CSV). Two modes: dryRun=true
     returns a validation report (row errors, dedupe, would-create counts)
     WITHOUT writing; dryRun=false applies the import transactionally.
   - CRUD for units and unit_residents (manual add/edit).
3. Publish a documented CSV template: tower, flat_no, carpet_area, owner_name,
   owner_mobile, tenant_name, tenant_mobile, parking_spots.
4. Handle edge cases: one mobile mapping to multiple units (landlord); multiple
   residents per unit; invalid/duplicate mobiles surfaced as row errors.
5. Admin UI: an import screen (upload → preview errors → confirm) and a unit
   list/detail view.
6. Seed: expand to 1 society with 500 units and ~2500 residents, realistic
   name/mobile distributions, parking spots. Keep idempotent.

NON-GOALS: no billing, no payments.

ACCEPTANCE CRITERIA:
- Tests: dryRun never writes; valid import creates expected rows; malformed rows
  reported without aborting the whole file in dryRun; landlord (multi-unit)
  mobile handled; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 2: directory + CSV import".
```

---

### TASK 3 — Notice board and resident PWA shell

```
Read AGENTS.md. Builds on merged Task 2.

GOAL: The daily-touch adoption surface — notices — plus a real installable PWA
shell for residents.

SCOPE:
1. DB migration: notices (society_id, title, body, audience, pinned bool,
   publish_at, expires_at), attachments (polymorphic). RLS enforced.
2. API: admin create/update/delete notices; resident GET /notices (respecting
   audience, publish/expiry, pinning).
3. apps/resident: make it a proper PWA (manifest, service worker, installable,
   mobile-first). Implement: login (OTP), a notices feed, and notice detail.
   Read views should tolerate being offline (cached last fetch).
4. apps/admin: a notices management screen.
5. Push notification scaffolding (FCM) behind an interface with a no-op fake
   for dev. Do not wire a real FCM project.

NON-GOALS: billing, payments, tickets.

ACCEPTANCE CRITERIA:
- Tests: audience targeting and publish/expiry filtering correct; RLS holds.
- Lighthouse PWA installability checks pass in the resident app build.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 3: notice board + resident PWA shell".
```

---

### TASK 4 — Billing engine (no payment yet)

```
Read AGENTS.md. Builds on merged Task 3.

GOAL: Generate per-unit bills from configurable bill heads. No money movement in
this task — payments come next.

SCOPE:
1. DB migration:
   - bill_heads (society_id, name, compute_rule enum
     [fixed|per_sqft|metered|flat_per_unit], rate numeric, tax_rule jsonb)
   - meter_readings (unit_id, head_id, period, prev_reading, current_reading)
   - billing_cycles (society_id, period, status [draft|published|closed])
   - bills (unit_id, cycle_id, due_date, status
     [unpaid|partial|paid|overdue], arrears_carry_forward numeric)
   - bill_line_items (bill_id, head_id, qty, rate, amount, tax_amount)
   All tenant-scoped, RLS enforced.
2. A billing service that, for a cycle, generates one bill per unit from the
   society's heads + readings + adjustments (arrears carry-forward, late
   fee/interest config, discounts/credits). Run generation as a BullMQ job.
3. Admin API/UI: configure bill heads & rates; create a cycle; preview;
   publish; collection dashboard (paid/partial/overdue) and per-unit ledger.
4. Resident API/UI: view own bills and line items; generate an invoice PDF.
5. Make tax handling configurable per line item (do NOT hardcode a GST rate;
   expose it as config — the rule will be confirmed separately).
6. Seed: 6 months of cycles across all heads with readings and a realistic
   paid/partial/overdue mix (paid status only; no real payments yet).

NON-GOALS: no payment gateway, no settlement.

ACCEPTANCE CRITERIA:
- Tests: each compute_rule produces correct amounts; arrears carry forward;
  metered head uses readings; cycle generation is idempotent per cycle; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 4: billing engine".
```

---

### TASK 5 — Payments via Razorpay Route + secure bank-account onboarding

```
Read AGENTS.md. Builds on merged Task 4. This task has compliance implications;
follow the structure exactly.

GOAL: Let residents pay bills, with funds settling DIRECTLY to each society's own
bank account via Razorpay Route linked accounts. The platform never custodies
funds. Razorpay is behind a PaymentProvider interface with a fake for tests.

SCOPE:
1. Define a PaymentProvider interface (createOrder, verifyWebhook,
   createLinkedAccount, transferToLinkedAccount, refund). Provide:
   - RazorpayProvider (uses the real SDK; keys via env; selected when
     PAYMENT_PROVIDER=razorpay)
   - FakePaymentProvider (deterministic; selected when PAYMENT_PROVIDER=fake) —
     used by all tests and local dev.
2. DB migration:
   - payments (amount, method, gateway_ref, status
     [created|captured|failed|refunded], settled_to_linked_account)
   - payment_allocations (payment_id, bill_id, allocated_amount) — supports
     partial and multi-bill payments and advances
   - gateway_events (raw payload, idempotency_key unique)
   - extend societies with razorpay_linked_account_id and a
     bank_account_onboarding state machine table:
     society_bank_accounts (society_id, account masked, ifsc, status
     [pending|under_review|activated|rejected], penny_drop_verified bool,
     approved_by_platform_admin uuid, audit fields)
3. Payment flow: POST /payments/order (creates a Razorpay order, splits/settles
   to the society's linked account via Route), POST /payments/webhook
   (idempotent; updates payment + allocates to bills + updates bill status).
   Add a reconciliation job that reconciles against gateway_events to catch
   missed webhooks.
4. SECURE bank-account onboarding (critical): admin submits bank+KYC details →
   triggers linked-account creation (provider) → status tracked. Any add/change
   of the settlement account REQUIRES ALL of: penny-drop verification flag,
   platform_super_admin approval endpoint, an audit_log entry, and a
   notification to existing society admins. A single society_admin must NEVER be
   able to change the settlement destination unilaterally.
5. Resident UI: pay a bill (UPI/card/netbanking/wallet via Razorpay checkout);
   show payment status. Admin UI: reconciliation view; bank-onboarding status.

NON-GOALS: do not take a platform cut of transactions; monetisation is
subscription-based (separate task). Do not store card data.

ACCEPTANCE CRITERIA:
- Tests (using FakePaymentProvider): order→webhook→allocation marks bills paid;
  partial payment yields partial status; duplicate webhook is idempotent;
  reconciliation recovers a dropped webhook; bank-account change is blocked
  without platform approval + penny-drop; audit_log written; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 5: Razorpay Route payments + secure bank onboarding".
```

---

### TASK 6 — Tickets (complaints + requests) with SLA

```
Read AGENTS.md. Builds on merged Task 5.

GOAL: A unified ticket model covering complaints and service requests, with
status workflow, per-category SLA, assignment, and escalation.

SCOPE:
1. DB migration:
   - tickets (society_id, unit_id, raised_by, type [complaint|request],
     category [electric|plumbing|mason|painting|ac_cleaning|shifting|
     parking_alloc|playground_alloc|other], description, status
     [open|assigned|in_progress|resolved|closed|reopened], priority,
     assigned_to, sla_due_at, channel [app|admin])
   - ticket_events (status changes, comments, assignment history)
   RLS enforced.
2. API: resident creates/tracks tickets; facility_manager triages, assigns,
   updates status. SLA computed per category; a BullMQ job flags breaches and
   triggers escalation notifications.
3. UI: resident "raise + track" screens; admin queue with filters and
   assignment.

NON-GOALS: no chatbot in this task (deferred to Task 9). Channel is app/admin only.

ACCEPTANCE CRITERIA:
- Tests: state machine transitions valid/invalid; SLA due-time computed per
  category; breach job flags overdue tickets; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 6: tickets + SLA".
```

---

### TASK 7 — Bookings and parking allocation

```
Read AGENTS.md. Builds on merged Task 6.

GOAL: Amenity bookings (playground, clubhouse) with conflict prevention, and
parking-spot allocation/rental that ties into ad-hoc payments.

SCOPE:
1. DB migration:
   - bookable_resources (society_id, name, slot_rules jsonb, capacity)
   - bookings (resource_id, unit_id, slot, status)
   - parking_allocations (spot_id, unit_id, period, rent_amount)
   RLS enforced.
2. API/UI: residents book amenity slots (reject conflicting/over-capacity
   bookings); admins allocate parking spots and create rentable-spot rentals
   that generate an ad-hoc bill (reuse Task 4 billing + Task 5 payments).

ACCEPTANCE CRITERIA:
- Tests: double-booking and over-capacity rejected; rentable-spot rental creates
  a payable bill; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 7: bookings + parking allocation".
```

---

### TASK 8 — Integration connector framework + first connectors

```
Read AGENTS.md. Builds on merged Task 7.

GOAL: A per-society, independently configurable connector ("widget") that pushes
canonical events to a society's external accounting/complaints software. Build
the FRAMEWORK plus two concrete connectors — not integrations for "any software".

SCOPE:
1. Define a canonical internal event contract emitted by existing modules:
   bill.generated, payment.captured, ticket.created, ticket.resolved.
2. DB migration: integration_configs (society_id, connector_type,
   encrypted_credentials, field_mappings jsonb, enabled_events). RLS enforced.
   Credentials encrypted at rest.
3. A connector dispatcher that, per society, routes enabled events to the
   configured connector with field mapping. Build exactly two connectors:
   - generic_webhook (outbound HTTP POST with HMAC signature + retries)
   - csv_export (writes a mapped CSV to a configured destination; "Tally-style")
4. Admin UI: enable/disable + configure a connector per society independently.

NON-GOALS: do not build named-vendor adapters (Tally API, ADDA, MyGate) now.

ACCEPTANCE CRITERIA:
- Tests: events dispatch only to enabled connectors; field mapping applied;
  webhook retries on failure; credentials never logged in plaintext; RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 8: integration connector framework + webhook & csv connectors".
```

---

### TASK 9 (optional, lowest priority) — Chatbot ticket intake

```
Read AGENTS.md. Builds on merged Task 8. Lowest ROI against the "kill the
spreadsheet" goal — build only after the core is proven.

GOAL: A chatbot that is an intake ROUTER and status reporter — never an
autonomous resolver.

SCOPE:
1. DB migration: chat_sessions, chat_messages (RLS enforced).
2. A chat endpoint that: classifies free text into a ticket category + extracts
   unit/urgency → creates a Task 6 ticket → confirms; falls back to a menu when
   unsure; answers "where's my complaint?" from the DB. The classifier is behind
   an interface with a deterministic rule-based fake for tests; the LLM
   implementation is selected by env and must never fabricate a resolution.

ACCEPTANCE CRITERIA:
- Tests (using the fake classifier): correct category routing; unknown input
  falls back to menu; status query reads from DB; no ticket is auto-resolved;
  RLS holds.
- `pnpm install && pnpm build && pnpm test` green.

Open a PR titled "Task 9: chatbot ticket intake".
```

---

## Notes on what was deliberately deferred

- **Platform→society subscription billing** (per-unit vs flat pricing, ₹0 pilot
  plan) is not in the task list above because it doesn't block the end-to-end
  pilot. Add it as a later task once a second society is real.
- **Real provider credentials** (Razorpay live/sandbox, SMS, FCM) are injected
  via env after Jules merges each task. Jules builds against the fakes.
- If any single task's PR comes back too large or partially failing, split it
  (e.g., Task 5 into "5a payments" and "5b bank onboarding") and re-run.
```
