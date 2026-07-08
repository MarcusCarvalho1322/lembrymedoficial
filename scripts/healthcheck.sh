#!/bin/bash
# ═══════════════════════════════════════════════════════════
# LEMBRYMED — Healthcheck da Stack
# ═══════════════════════════════════════════════════════════
# Uso: ./scripts/healthcheck.sh
# Cron: */5 * * * * /opt/lembrymed/scripts/healthcheck.sh
# ═══════════════════════════════════════════════════════════

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
LOG_FILE="/var/log/lembrymed-healthcheck.log"
ALERT_COOLDOWN_FILE="/tmp/lembrymed_last_alert"

# Verificar API
HTTP_CODE=$(curl -s -o /tmp/lembrymed_health.json -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  STATUS=$(jq -r '.status' /tmp/lembrymed_health.json 2>/dev/null || echo "unknown")
  if [ "$STATUS" = "ok" ]; then
    # Tudo OK — limpar cooldown de alerta
    rm -f "$ALERT_COOLDOWN_FILE"
    echo "[$(date)] ✅ Health OK (HTTP $HTTP_CODE, status: $STATUS)" >> "$LOG_FILE"
    exit 0
  else
    echo "[$(date)] ⚠️ Health DEGRADED (HTTP $HTTP_CODE, status: $STATUS)" | tee -a "$LOG_FILE"
  fi
else
  echo "[$(date)] ❌ Health FAIL (HTTP $HTTP_CODE)" | tee -a "$LOG_FILE"
fi

# ── Alerta (com cooldown de 15 min para não spammar) ──────
NOW=$(date +%s)
LAST_ALERT=0
if [ -f "$ALERT_COOLDOWN_FILE" ]; then
  LAST_ALERT=$(cat "$ALERT_COOLDOWN_FILE" 2>/dev/null || echo 0)
fi

if [ $((NOW - LAST_ALERT)) -gt 900 ]; then
  echo "$NOW" > "$ALERT_COOLDOWN_FILE"

  # Notificar admin via WhatsApp (se configurado)
  if [ -f /opt/lembrymed/.env ]; then
    export $(grep -v '^#' /opt/lembrymed/.env | grep -v '^$' | xargs)
  fi

  if [ -n "${ADMIN_WHATSAPP:-}" ] && [ -n "${ZAPI_INSTANCE_ID:-}" ] && [ -n "${ZAPI_TOKEN:-}" ]; then
    curl -s -X POST "https://api.z-api.io/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_TOKEN/send-text" \
      -H "Content-Type: application/json" \
      -d "{\"phone\": \"$ADMIN_WHATSAPP\", \"message\": \"🚨 LEMBRYMED: Healthcheck FALHOU (HTTP $HTTP_CODE) em $(date). Verificar VPS!\"}" \
      > /dev/null 2>&1 || true
  fi
fi

exit 1
