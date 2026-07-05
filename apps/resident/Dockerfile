FROM node:22-alpine AS base

FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
RUN npm install -g pnpm@10.33.0 turbo
COPY . .
RUN turbo prune @mysociety/resident --docker

# Add lockfile and package.json's of isolated subworkspace
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app

# First install dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN npm install -g pnpm@10.33.0
RUN pnpm install --frozen-lockfile

# Build the project and its dependencies
COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json

# Ensure Next.js standalone mode is built
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@mysociety/resident...

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=installer /app/apps/resident/next.config.ts .
COPY --from=installer /app/apps/resident/package.json .

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=installer --chown=nextjs:nodejs /app/apps/resident/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/resident/.next/static ./apps/resident/.next/static
# Need to copy public if we had one
COPY --from=installer --chown=nextjs:nodejs /app/apps/resident/public ./apps/resident/public

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/resident/server.js"]
