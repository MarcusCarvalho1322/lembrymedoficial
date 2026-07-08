#!/bin/bash
# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Backup do Banco de Dados (Neon → arquivo + S3)
# ═══════════════════════════════════════════════════════════
# Uso: ./scripts/backup.sh
# Cron: 0 3 * * * /opt/lembrymed/scripts/backup.sh
# ═══════════════════════════════════════════════════════════

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/opt/lembrymed/data/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="/var/log/lembrymed-backup.log"

# Carregar .env se existir
if [ -f /opt/lembrymed/.env ]; then
  export $(grep -v '^#' /opt/lembrymed/.env | grep -v '^$' | xargs)
fi

# Verificar variáveis obrigatórias
if [ -z "${DATABASE_URL_UNPOOLED:-}" ]; then
  echo "[$(date)] ❌ DATABASE_URL_UNPOOLED não definida" | tee -a "$LOG_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[$(date)] 📦 Iniciando backup do banco Lembrymed..." | tee -a "$LOG_FILE"

# Dump do Neon PostgreSQL
DUMP_FILE="$BACKUP_DIR/lembrymed_$TIMESTAMP.dump"

if pg_dump "$DATABASE_URL_UNPOOLED" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$DUMP_FILE" 2>>"$LOG_FILE"; then

  # Comprimir
  gzip -f "$DUMP_FILE"
  DUMP_SIZE=$(du -h "$DUMP_FILE.gz" | cut -f1)
  echo "[$(date)] ✅ Backup concluído: $DUMP_FILE.gz ($DUMP_SIZE)" | tee -a "$LOG_FILE"

  # Sincronizar com S3 (se configurado)
  if [ -n "${S3_BUCKET:-}" ]; then
    echo "[$(date)] ☁️ Sincronizando com S3..." | tee -a "$LOG_FILE"
    aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/lembrymed/" \
      --exclude "*" --include "*.dump.gz" \
      --storage-class STANDARD_IA 2>>"$LOG_FILE" || \
      echo "[$(date)] ⚠️ Falha ao sincronizar com S3" | tee -a "$LOG_FILE"
  fi

else
  echo "[$(date)] ❌ ERRO: pg_dump falhou!" | tee -a "$LOG_FILE"

  # Notificar admin via WhatsApp (se ADMIN_WHATSAPP configurado)
  if [ -n "${ADMIN_WHATSAPP:-}" ] && [ -n "${ZAPI_INSTANCE_ID:-}" ] && [ -n "${ZAPI_TOKEN:-}" ]; then
    curl -s -X POST "https://api.z-api.io/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_TOKEN/send-text" \
      -H "Content-Type: application/json" \
      -d "{\"phone\": \"$ADMIN_WHATSAPP\", \"message\": \"🚨 LEMBRYMED: Backup do banco FALHOU em $(date). Verificar $LOG_FILE\"}" \
      > /dev/null 2>&1 || true
  fi

  exit 1
fi

# Limpar backups antigos
DELETED=$(find "$BACKUP_DIR" -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] 🧹 $DELETED backups antigos removidos (> $RETENTION_DAYS dias)" | tee -a "$LOG_FILE"
fi

echo "[$(date)] ✅ Rotina de backup concluída" | tee -a "$LOG_FILE"
