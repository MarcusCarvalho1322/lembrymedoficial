# Production Health Check — Pós-deploy v3 (Ondas 0-3)

Roteiro de verificação pós-merge da branch `claude/xenodochial-hugle-143b18`.
Cada passo retorna evidência concreta — execute na ordem, copie a saída e
me passe o resultado.

> ℹ️ Pré-requisito: ter `jq` e `psql` instalados. Variáveis sugeridas no shell:
>
> ```bash
> export API_URL="https://api.lembrymed.com.br"
> export ADMIN_TOKEN="<JWT obtido via POST /admin/login>"
> export DATABASE_URL_UNPOOLED="<DSN unpooled do Neon>"
> ```

---

## 1️⃣  Boot dos services Railway

**Esperado**: 2 services rodando (após split da Fase 2). Se ainda não fez
o split, há 1 service rodando em modo "all" (back-compat — também OK).

### 1.1 Service API

No painel Railway → Service `lembrymed-api` → Logs (últimas 100 linhas):

```
✅ Procurar:
   "Lembrymed boot — RUN_MODE=api"      ← se já fez split
   "🚀 Lembrymed API running on port"
   "Workers started: scheduler, sender, ..."   ← se modo 'all'

❌ Não pode aparecer:
   "Configuração inválida de variáveis de ambiente"
   "uncaughtException"
   "ECONNREFUSED" (frequente)
```

### 1.2 Service Workers (se já fez split)

Painel Railway → Service `lembrymed-workers` → Logs:

```
✅ Procurar:
   "Lembrymed boot — RUN_MODE=workers"
   "🤖 Workers process listening for health on port 3001"
   "Reminder scheduler started (setInterval 60s, tz: America/Sao_Paulo)"
   "Workers started: scheduler, sender, alerter, lifecycle, ..."

❌ Não pode aparecer:
   "Configuração inválida..." (env faltando)
```

---

## 2️⃣  Healthcheck externo

```bash
# API HTTP
curl -s $API_URL/health | jq

# Esperado:
# {
#   "status": "ok",
#   "checks": {
#     "redis": { "ok": true, "latencyMs": <baixo> },
#     "database": { "ok": true, "latencyMs": <baixo> },
#     "queues": { "reminder_waiting": <int>, ... }
#   }
# }
```

Para o service de workers, o healthcheck é interno (porta 3001 não exposta
publicamente). O Railway mostra como "healthy/unhealthy" no painel.

---

## 3️⃣  Migrations aplicadas?

```bash
psql "$DATABASE_URL_UNPOOLED" -At -c "
SELECT
  (to_regclass('consent_logs')      IS NOT NULL) AS consent_logs,
  (to_regclass('admin_audit_logs')  IS NOT NULL) AS admin_audit_logs,
  (to_regclass('privacy_policies')  IS NOT NULL) AS privacy_policies,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'medications' AND column_name = 'deactivated_reason'
  ) AS medications_deactivated_reason,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'interaction_mode'
  ) AS patients_interaction_mode
"
```

**Esperado** (todos `t`):
```
t|t|t|t|t
```

Se algum vier `f`, rodar a migration correspondente:
```bash
psql "$DATABASE_URL_UNPOOLED" < packages/database/migrations/0002_cascade_and_lgpd_tables.sql
psql "$DATABASE_URL_UNPOOLED" < packages/database/migrations/0005_medications_deactivated_reason.sql
psql "$DATABASE_URL_UNPOOLED" < packages/database/migrations/0006_patients_interaction_mode.sql
```

---

## 4️⃣  Scheduler está enfileirando lembretes? (sinal vital)

> ⚠️ Este é o teste mais importante. Se o resultado for 0 e há pacientes
> ativos com medicamentos agora, **o scheduler está parado em produção**
> (regressão do C1).

### 4.1 Tem pacientes ativos com medicamentos?

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT
  COUNT(DISTINCT p.id) AS active_patients_with_meds,
  COUNT(DISTINCT m.id) AS active_medications
FROM patients p
JOIN medications m ON m.patient_id = p.id AND m.is_active = true
JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
WHERE p.is_active = true AND p.onboarding_step = 'active'
"
```

### 4.2 reminder_logs nas últimas 24h

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT
  reminder_type,
  status,
  COUNT(*) AS total,
  MAX(created_at) AS last_log
FROM reminder_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY reminder_type, status
ORDER BY reminder_type, status
"
```

**Esperado**: se há `active_patients_with_meds > 0`, deve aparecer linhas com
`reminder_type` ∈ `(t_minus_10, t_zero, t_plus_10)` e `status='sent'`.
`MAX(created_at)` deve estar próximo de "agora" (último tick foi <1 min atrás).

### 4.3 Métricas em tempo real (filas BullMQ)

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  $API_URL/admin/queue | jq
```

**Esperado**:
- `reminders.waiting` ou `reminders.completed` > 0 (depende do momento)
- `reminders.failed` deve estar baixo (idealmente 0; <5% do total OK)
- `delivery.delivery_rate` ≥ 95%
- `circuit_breaker.state` = `CLOSED`

---

## 5️⃣  Z-API conectada?

### 5.1 Status direto no provider

```bash
# Via Railway shell ou em qualquer máquina com as envs
curl -s -H "Client-Token: $ZAPI_CLIENT_TOKEN" \
  "https://api.z-api.io/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_TOKEN/status" | jq
```

**Esperado**: `{ "connected": true, "session": "running", ... }`

### 5.2 Worker zapi-health detectou?

Buscar nos logs do service de workers:
- `Z-API health: ...` — verificação periódica (a cada 5 min)
- Se `connected:false` por > 5 min → alerta WhatsApp para `ADMIN_WHATSAPP`

---

## 6️⃣  Webhook está recebendo mensagens?

Última mensagem inbound (qualquer paciente):

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT
  direction, content, created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))::int AS seconds_ago
FROM message_logs
WHERE direction = 'inbound'
ORDER BY created_at DESC
LIMIT 5
"
```

**Esperado**: linhas recentes (`seconds_ago` baixo) se há tráfego real.

---

## 7️⃣  Funil de onboarding (sanidade do C2)

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  $API_URL/admin/onboarding-funnel | jq
```

**Esperado** (após C2):
```json
{
  "funnel": [
    { "onboarding_step": "welcome_sent",          "count": ... },
    { "onboarding_step": "medications_requested", "count": ... },
    { "onboarding_step": "medications_received",  "count": ... },
    { "onboarding_step": "medications_confirmed", "count": ... },
    { "onboarding_step": "family_asked",          "count": ... },
    { "onboarding_step": "family_registered",     "count": ... },
    { "onboarding_step": "active",                "count": ... }
  ],
  "stuck_count": <int>
}
```

A **ordem** dos steps deve ser a acima. Se estiver embaralhada,
a query ainda usa nomes antigos (regressão do C2).

---

## 8️⃣  Renovação seletiva de medicamentos (C3)

Procurar nos últimos 30 dias por reativações:

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT
  p.id AS patient_id,
  p.full_name,
  COUNT(*) FILTER (WHERE m.deactivated_reason = 'suspension') AS suspended,
  COUNT(*) FILTER (WHERE m.deactivated_reason = 'med_update') AS med_updated,
  COUNT(*) FILTER (WHERE m.is_active = true)                  AS active_now
FROM patients p
JOIN medications m ON m.patient_id = p.id
WHERE m.updated_at > NOW() - INTERVAL '30 days'
GROUP BY p.id, p.full_name
HAVING COUNT(*) > 1
ORDER BY p.id
LIMIT 10
"
```

**Sanidade**: se houver pacientes renovados com `med_update > 0` e
`active_now > 0`, ver se nenhum medicamento `med_update` está ativo
indevidamente:

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT id, patient_id, name, deactivated_reason, is_active
FROM medications
WHERE is_active = true AND deactivated_reason IS NOT NULL
LIMIT 20
"
```

**Esperado**: zero linhas (medicamento ativo NÃO deve ter `deactivated_reason`).

---

## 9️⃣  Tool use API está funcionando? (Fase 1)

Após a próxima conversa com Claude (onboarding ou med-update), verificar logs:

- **Antes** da Fase 1: logs continham `"agentReply"` com `[X:Y]` no texto.
- **Depois**: logs devem mostrar `"Chamando Claude Sonnet para onboarding (tool use)"`
  e tool calls são processadas sem o `cleanReply` regex.

Procurar nos logs do service API:
```
"Chamando Claude Sonnet para onboarding (tool use)"
"Chamando Claude Sonnet para med_update (tool use)"
"Chamando Claude Sonnet para family_update (tool use)"
```

Se houver rejeição por validação semântica (anti-prompt-injection):
```
"Tool ... rejeitada pela validação semântica"
"Marcador ... rejeitado"
```

---

## 🔟  Sanidade geral em uma query

```bash
psql "$DATABASE_URL_UNPOOLED" -c "
SELECT
  (SELECT COUNT(*) FROM patients WHERE is_active)                          AS active_patients,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')             AS active_subs,
  (SELECT COUNT(*) FROM medications WHERE is_active)                       AS active_meds,
  (SELECT COUNT(*) FROM reminder_logs WHERE created_at > NOW() - '1d'::interval) AS reminders_24h,
  (SELECT COUNT(*) FROM medication_confirmations WHERE date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS confirmations_today,
  (SELECT COUNT(*) FROM message_logs WHERE direction = 'inbound' AND created_at > NOW() - '1h'::interval) AS inbound_last_hour,
  (SELECT COUNT(*) FROM family_alert_logs WHERE date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS family_alerts_today
"
```

---

## O que me mandar

Copie as saídas dos passos 1.1, 1.2, 3, 4.1, 4.2, 4.3, 7 e 10.

Se algum passo der erro, copie o erro também (sem mascarar URLs/IDs internos —
isso é log interno seguro de compartilhar).
