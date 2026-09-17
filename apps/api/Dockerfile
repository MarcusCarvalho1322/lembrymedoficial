# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Dockerfile API (Express + Workers BullMQ)
# ═══════════════════════════════════════════════════════════
# Multi-stage build: (1) install + bundle com esbuild,
# (2) runtime enxuto só com o bundle + externals.
# ═══════════════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-slim AS base

WORKDIR /app

# Força invalidação de cache (bump manual se precisar)
RUN echo "lembrymed-api-build-2026-07-07"

# Copiar manifests para cache do npm install
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instalar TODAS as dependências (npm install tolera lock desatualizado)
RUN npm install --no-audit --no-fund

# Instalar peer deps que não vêm automaticamente
RUN npm install semver luxon uuid --no-save

# Copiar código-fonte
COPY packages/ packages/
COPY apps/api/ apps/api/

# Bundle com esbuild: resolve path aliases, inline deps,
# gera um único JS. Externals: módulos nativos / com binary.
RUN node_modules/.bin/esbuild apps/api/src/index.ts \
    --bundle \
    --platform=node \
    --target=node20 \
    --outfile=apps/api/dist/server.js \
    --external:ioredis \
    --external:pg \
    --external:bcryptjs \
    --external:node-cron \
    --external:semver \
    --external:luxon \
    --external:uuid \
    --log-level=info

# ── Stage 2: Production Runtime ─────────────────────────────
FROM node:20-slim AS prod

WORKDIR /app

# Copiar apenas o bundle + node_modules necessários
COPY --from=base /app/apps/api/dist/server.js ./apps/api/dist/server.js
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Usuário não-root (segurança)
USER node

# Healthcheck: usa o endpoint /health interno
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/api/dist/server.js"]

# ── Stage 3: Development ────────────────────────────────────
FROM base AS dev

WORKDIR /app
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npx", "tsx", "watch", "apps/api/src/index.ts"]
