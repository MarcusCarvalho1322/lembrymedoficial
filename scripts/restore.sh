#!/bin/bash
# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Restore do Banco de Dados (PostgreSQL container)
# ═══════════════════════════════════════════════════════════
# Uso: ./scripts/restore.sh <arquivo.dump.gz>
# ⚠️  CUIDADO: sobrescreve dados no banco!
# ═══════════════════════════════════════════════════════════

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <arquivo.dump.gz>"
  echo "Exemplo:"
  echo "  $0 /opt/lembrymed/data/backups/lembrymed_20260707_030000.dump.gz"
  exit 1
fi

DUMP_FILE="$1"
CONTAINER="${POSTGRES_CONTAINER:-lembrymed-postgres}"

# Carregar .env
if [ -f /opt/lembrymed/.env ]; then
  export $(grep -v '^#' /opt/lembrymed/.env | grep -v '^$' | xargs)
fi

PGUSER="${POSTGRES_USER:-lembrymed}"
PGDB="${POSTGRES_DB:-lembrymed}"

if [ ! -f "$DUMP_FILE" ]; then
  echo "❌ Arquivo não encontrado: $DUMP_FILE"
  exit 1
fi

echo ""
echo "⚠️  ATENÇÃO: Isso vai SOBRESCREVER todos os dados no banco '$PGDB'!"
echo "   Arquivo: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
echo ""
read -p "Digite 'RESTORE' para confirmar: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  echo "❌ Restore cancelado"
  exit 0
fi

echo ""
echo "🔄 Restaurando..."

if [[ "$DUMP_FILE" == *.gz ]]; then
  gunzip -c "$DUMP_FILE" | docker exec -i "$CONTAINER" pg_restore \
    -U "$PGUSER" \
    -d "$PGDB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose
  RESTORE_EXIT=$?
else
  docker exec -i "$CONTAINER" pg_restore \
    -U "$PGUSER" \
    -d "$PGDB" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose < "$DUMP_FILE"
  RESTORE_EXIT=$?
fi

if [ $RESTORE_EXIT -eq 0 ]; then
  echo ""
  echo "✅ Restore concluído com sucesso"
else
  echo ""
  echo "❌ ERRO no restore! Verifique os logs acima."
  exit 1
fi
