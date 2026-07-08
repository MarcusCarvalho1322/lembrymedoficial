# Healthcheck — Lembrymed

Documentação dos healthchecks da aplicação e procedimentos quando algo falha.

---

## Endpoints de saúde

| Endpoint | Porta | Descrição |
|----------|-------|-----------|
| `GET /health` | 3000 (API) | Status da API: Redis, banco de dados, versão |
| `GET /metrics` | 3000 (API) | Métricas detalhadas: filas BullMQ, entregas 24h, uptime, memória |
| `GET /` | 3001 (Web) | Frontend — retorna 200 se Next.js está respondendo |

### Resposta esperada de `/health`:
```json
{
  "status": "ok",
  "version": "v2.11-obs",
  "timestamp": "2026-07-07T12:00:00.000Z",
  "checks": {
    "redis": { "status": "connected", "latencyMs": 2 },
    "database": { "status": "connected", "latencyMs": 150 }
  }
}
```

### Status possíveis:
- **200 OK** + `"status":"ok"` → tudo funcionando
- **503 Service Unavailable** + `"status":"degraded"` → algo falhou (verificar `checks`)

---

## Healthchecks automáticos

| Check | Frequência | O que verifica |
|-------|-----------|----------------|
| **Docker HEALTHCHECK** (API) | 30s | `GET /health` dentro do container |
| **Docker HEALTHCHECK** (Web) | 30s | `GET /` dentro do container |
| **Caddy** | — | Reverse proxy; se cair, nada responde |
| **scripts/healthcheck.sh** | 5min (cron) | `GET /health` externo + alerta WhatsApp |
| **UptimeRobot** (externo) | 5min | Monitoramento externo (recomendado configurar) |
| **Worker zapi-health** | 5min | Verifica se Z-API está conectada |
| **Railway healthcheck** (legado) | 30s | Só na arquitetura Railway (será descontinuado) |

---

## O que fazer quando algo falha

### ❌ `/health` retorna `degraded`

**Causas possíveis e soluções:**

| Check | Sintoma | Solução |
|-------|---------|---------|
| `redis` = `error` | Redis caiu | `docker compose restart redis` |
| `database` = `error` | Neon offline ou cold-start | Verificar painel Neon; aguardar (cold-start ~30s) |
| Ambos `error` | VPS com problema | `docker compose ps` — verificar se containers estão UP |

### ❌ `/health` não responde

1. API caiu → `docker compose logs api` (ver stack trace)
2. VPS offline → verificar painel do provedor
3. Caddy caiu → `docker compose restart caddy`

### ❌ Site não carrega, mas `/health` OK

1. Web container caiu → `docker compose restart web`
2. Build quebrou → `docker compose logs web`

---

## Monitoramento externo recomendado

### UptimeRobot (gratuito)
1. Criar conta em https://uptimerobot.com
2. Adicionar monitor: `https://lembrymed.com.br/health`
3. Intervalo: 5 minutos
4. Alertas: email + WhatsApp (via push notification)

### Configurar na VPS:
```bash
# Adicionar ao crontab para alerta via WhatsApp
echo "*/5 * * * * /opt/lembrymed/scripts/healthcheck.sh" | crontab -
```

O script envia WhatsApp para `ADMIN_WHATSAPP` quando `/health` falha, com cooldown de 15 minutos entre alertas.

---

## Logs

```bash
# Logs da API (últimas 50 linhas)
docker compose -f docker-compose.prod.yml logs --tail=50 api

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f api

# Logs de todos os serviços
docker compose -f docker-compose.prod.yml logs --tail=100

# Logs de healthcheck
tail -f /var/log/lembrymed-healthcheck.log

# Logs de backup
tail -f /var/log/lembrymed-backup.log
```
