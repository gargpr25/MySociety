# MySociety
## Commands
- Install: `pnpm install`
- Build: `pnpm build`
- Test: `pnpm test`
- DB up (local): `docker compose up -d db redis`
- Migrate: `pnpm --filter @mysociety/db migrate`
- Seed (dev only): `SEED_ENABLED=true pnpm --filter @mysociety/seed run seed`
