#!/bin/bash
# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Restore do Banco de Dados
# ═══════════════════════════════════════════════════════════
# Uso: ./scripts/restore.sh <arquivo.dump.gz>
# ⚠️  CUIDADO: sobrescreve dados no banco alvo!
# ═══════════════════════════════════════════════════════════

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <arquivo.dump.gz>"
  echo ""
  echo "Exemplos:"
  echo "  $0 /opt/lembrymed/data/backups/lembrymed_20260707_030000.dump.gz"
  echo "  $0 /opt/lembrymed/data/backups/lembrymed_20260707_030000.dump.gz --staging"
  exit 1
fi

DUMP_FILE="$1"
TARGET="${2:-production}"

# Carregar .env
if [ -f /opt/lembrymed/.env ]; then
  export $(grep -v '^#' /opt/lembrymed/.env | grep -v '^$' | xargs)
fi

# Selecionar URL do banco
if [ "$TARGET" = "staging" ]; then
  DB_URL="${STAGING_DATABASE_URL_UNPOOLED:-${DATABASE_URL_UNPOOLED}}"
  echo "⚠️  ALVO: STAGING"
else
  DB_URL="${DATABASE_URL_UNPOOLED}"
  echo "🔴 ALVO: PRODUÇÃO"
fi

if [ -z "${DB_URL:-}" ]; then
  echo "❌ DATABASE_URL_UNPOOLED não definida"
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "❌ Arquivo não encontrado: $DUMP_FILE"
  exit 1
fi

echo ""
echo "⚠️  ATENÇÃO: Isso vai SOBRESCREVER todos os dados no banco '$TARGET'!"
echo "   Arquivo: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
echo "   Banco:   $(echo "$DB_URL" | sed 's/\/\/.*@/\/\/***@/')"
echo ""
read -p "Digite 'RESTORE' para confirmar: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  echo "❌ Restore cancelado"
  exit 0
fi

echo ""
echo "🔄 Restaurando..."

# Descomprimir e restaurar
if [[ "$DUMP_FILE" == *.gz ]]; then
  gunzip -c "$DUMP_FILE" | pg_restore \
    --dbname="$DB_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose 2>&1
else
  pg_restore \
    --dbname="$DB_URL" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose \
    "$DUMP_FILE" 2>&1
fi

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Restore concluído com sucesso"
else
  echo ""
  echo "❌ ERRO no restore! Verifique os logs acima."
  exit 1
fi
