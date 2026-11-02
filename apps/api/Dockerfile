FROM node:22-alpine AS builder

# Pinned to the "packageManager" version in the root package.json
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm install -g --ignore-scripts pnpm@10.33.0

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @fitcoach/shared build
RUN pnpm --filter api build

# tsup leaves dependencies external, so the runner needs the API's production
# node_modules (including the built @fitcoach/shared).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter api deploy --prod --legacy /prod/api

# --- Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

# Drop from root to a dedicated non-root user so that a compromised process
# cannot write to the host filesystem or escalate privileges via setuid binaries.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nodeuser

COPY --from=builder /prod/api/node_modules ./node_modules
COPY --from=builder /prod/api/package.json ./
COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/apps/api/drizzle ./drizzle

ENV NODE_ENV=production

USER nodeuser

EXPOSE 3000

# Apply pending migrations, then start the API
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
