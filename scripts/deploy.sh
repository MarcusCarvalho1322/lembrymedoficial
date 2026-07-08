#!/bin/bash
# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Deploy Manual (fallback se GitHub Actions falhar)
# ═══════════════════════════════════════════════════════════
# Uso: ./scripts/deploy.sh [--no-build]
# ═══════════════════════════════════════════════════════════

set -euo pipefail

cd /opt/lembrymed

NO_BUILD=false
if [ "${1:-}" = "--no-build" ]; then
  NO_BUILD=true
fi

echo "📦 Deploy Lembrymed — $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Backup do .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "📄 .env backup salvo"

# Pull do repositório
echo "⬇️  git pull..."
git pull origin main

# Build + restart
if [ "$NO_BUILD" = false ]; then
  echo "🔨 Build..."
  docker compose -f docker-compose.prod.yml build --pull
fi

echo "🚀 Deploy..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# Limpar imagens antigas
docker image prune -f --filter "until=24h" > /dev/null 2>&1 || true

# Healthcheck
echo "⏳ Aguardando healthcheck..."
sleep 8

if curl -fSs http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ Deploy OK — API saudável"
else
  echo "❌ Healthcheck falhou!"
  echo "📋 Últimas 20 linhas de log da API:"
  docker compose -f docker-compose.prod.yml logs --tail=20 api
  exit 1
fi

echo "✅ Deploy concluído com sucesso"
