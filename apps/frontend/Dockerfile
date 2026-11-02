FROM node:22-alpine AS builder

# Pinned to the "packageManager" version in the root package.json
RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm install -g pnpm@10.33.0

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter frontend...

COPY packages/shared/ ./packages/shared/
COPY apps/frontend/ ./apps/frontend/

RUN pnpm --filter @fitcoach/shared build
# Inlined into the client bundle at build time (see next.config.ts)
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter frontend build

# --- Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Drop from root to a dedicated non-root user so that a compromised process
# cannot write to the host filesystem or escalate privileges via setuid binaries.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /workspace/apps/frontend/.next/standalone ./
COPY --from=builder /workspace/apps/frontend/.next/static ./.next/static
COPY --from=builder /workspace/apps/frontend/public* ./public/

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
