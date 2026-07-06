FROM node:22-alpine AS base

FROM base AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk update && apk add --no-cache libc6-compat
# Set working directory
WORKDIR /app
RUN npm install -g pnpm@10.33.0 turbo
COPY . .
RUN turbo prune @mysociety/api --docker

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
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm turbo run build --filter=@mysociety/api...

FROM base AS runner
WORKDIR /app

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs
COPY --from=installer /app .

CMD node apps/api/dist/server.js
