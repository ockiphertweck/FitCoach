FROM node:22-alpine AS builder

RUN --mount=type=cache,id=npm-cache,target=/root/.npm \
    npm install -g pnpm

WORKDIR /workspace

COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install

COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @fitcoach/shared build
RUN pnpm --filter api build

# --- Runner ---
FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/apps/api/package.json ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
