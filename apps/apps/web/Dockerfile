# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Dockerfile Web (Next.js Standalone)
# ═══════════════════════════════════════════════════════════
# Multi-stage build: (1) build com dependências completas,
# (2) runtime enxuto só com o necessário.
# ═══════════════════════════════════════════════════════════

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-slim AS base

WORKDIR /app

# Copiar manifests para cache de npm install
COPY package.json package-lock.json turbo.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Instalar dependências
RUN npm ci --no-audit --no-fund

# Copiar código fonte
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# Build Next.js em modo standalone
WORKDIR /app/apps/web
RUN npm run build

# ── Stage 2: Production Runtime ─────────────────────────────
FROM node:20-slim AS prod

WORKDIR /app

# Copiar apenas o necessário do build standalone
COPY --from=base /app/apps/web/.next/standalone ./
COPY --from=base /app/apps/web/.next/static ./.next/static
COPY --from=base /app/apps/web/public ./public

# Copiar node_modules do monorepo (workspace packages)
COPY --from=base /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Usuário não-root (segurança)
USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]

# ── Stage 3: Development (hot-reload) ────────────────────────
FROM base AS dev

WORKDIR /app/apps/web
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npx", "next", "dev"]
