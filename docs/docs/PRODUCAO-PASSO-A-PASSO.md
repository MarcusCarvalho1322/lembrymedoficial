# 🚀 Deploy em Produção — Passo a Passo (sem terminal, ou com terminal mínimo)

Guia para Marcus colocar tudo no ar **sem precisar saber programar**.
Faça **na ordem** — cada passo depende do anterior.

> ⏱️ **Tempo total estimado:** 30-40 min, fazendo com calma.

---

## ✅ Pré-conferência

Antes de começar, garanta que você tem:

- [ ] Acesso ao painel **Railway** (`railway.app/dashboard`)
- [ ] Acesso ao painel **Neon** (`console.neon.tech`)
- [ ] Senha do admin do Lembrymed
- [ ] 30 min livres (sem deploy/produção sob fogo)
- [ ] Idealmente, um horário de baixo tráfego (madrugada BRT ou início da manhã)

---

## 📌 PASSO 1 — Aplicar as duas migrations no Neon

**O que isso faz:** adiciona 2 colunas novas no banco que os fixes precisam para funcionar.

### Sem terminal — via painel Neon

1. Abra `console.neon.tech`
2. Selecione o projeto **Lembrymed**
3. No menu lateral, clique em **"SQL Editor"**
4. **Cole o SQL abaixo** e clique em "Run":

```sql
-- Migration 0005 — coluna deactivated_reason em medications
ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_meds_deactivated_reason
  ON medications (patient_id, deactivated_reason)
  WHERE is_active = false;

-- Migration 0006 — coluna interaction_mode em patients
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS interaction_mode VARCHAR(32);

UPDATE patients
   SET interaction_mode = 'med_update',
       agent_session_id = NULL
 WHERE agent_session_id = 'med_update_mode';

UPDATE patients
   SET interaction_mode = 'family_update',
       agent_session_id = NULL
 WHERE agent_session_id = 'family_update_mode';

-- Verificação (deve retornar 'OK' duas vezes)
SELECT 'OK' WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='medications' AND column_name='deactivated_reason'
);
SELECT 'OK' WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='patients' AND column_name='interaction_mode'
);
```

5. **Resultado esperado:** o output final mostra `'OK'` duas vezes. Se aparecer apenas uma vez ou nenhuma, **pare** e me avise.

> 💡 **Estas migrations são seguras**: só ADICIONAM colunas e índice.
> Não removem nada. Não bloqueiam tabela (operação rápida).

### Recomendação: testar antes em Preview Branch

Neon permite criar uma cópia do banco para testar. Se quiser ser extra-cauteloso:

1. No Neon → "Branches" → "Create branch" → escolher main
2. Rodar o SQL acima na branch nova
3. Se passar, repetir no main

---

## 📌 PASSO 2 — Configurar `RUN_MODE=api` no service atual

**O que isso faz:** prepara o service atual para o split. Sem essa configuração, o deploy seguinte ainda funciona (modo legado "all"), mas a separação não acontece.

### Via painel Railway

1. Abra `railway.app/dashboard`
2. Selecione o projeto **Lembrymed**
3. Clique no service da API (provavelmente chamado `lembrymed-api` ou similar)
4. Aba **"Variables"**
5. Procure se já existe `RUN_MODE` — se existir, edite. Se não, clique em **"+ New Variable"**:
   - **Nome:** `RUN_MODE`
   - **Valor:** `api`
6. Clique **"Add"**
7. O Railway vai redeploy automaticamente — aguarde ~2 min

### Como verificar que funcionou

1. Mesmo service → aba **"Deployments"** → último deployment → **"View logs"**
2. Procure por uma linha como:
   ```
   Lembrymed boot — RUN_MODE=api
   🚀 Lembrymed API running on port 3000
   ```
3. **NÃO deve aparecer:** `Workers started: scheduler, sender, ...`

Se aparecer "Workers started" mesmo com RUN_MODE=api, me avise.

### ⚠️ IMPORTANTE: nesse momento os WORKERS PARAM

Ao colocar `RUN_MODE=api` no service único, os workers param de rodar (ainda
não criamos o 2º service). **Os lembretes vão parar por alguns minutos.**

**Recomendo fazer este passo IMEDIATAMENTE seguido do PASSO 3** para minimizar
a janela sem lembretes (target: <10 min).

---

## 📌 PASSO 3 — Criar 2º service Railway para os workers

**O que isso faz:** sobe um segundo processo, separado da API, que cuida
exclusivamente dos lembretes. Se a API cair por um bug, os lembretes continuam.

### Via painel Railway

1. Mesma página do projeto Lembrymed
2. Clique em **"+ New"** (canto superior direito) → **"GitHub Repo"**
3. Escolha o mesmo repositório do Lembrymed
4. **Branch:** `main` (ou a branch que você fez merge desta sessão)
5. Espere o Railway detectar o `Dockerfile`
6. **Antes do primeiro deploy**, configure:

#### Settings

- **Service Name:** `lembrymed-workers` (ou similar)
- **Root Directory:** vazio (raiz do repo)
- **Build Command:** deixe vazio (Dockerfile cuida)
- **Start Command:** deixe vazio (Dockerfile cuida)
- **Healthcheck Path:** `/health`
- **Healthcheck Port:** `3001`

#### Variables (a parte mais importante)

Você precisa **TODAS as envs do service da API** + uma nova:

| Variável | Valor |
|---|---|
| **RUN_MODE** | `workers` (NOVA) |
| WORKERS_HEALTH_PORT | `3001` (opcional, é o default) |
| NODE_ENV | `production` |
| DATABASE_URL | (mesma do service API) |
| DATABASE_URL_UNPOOLED | (mesma) |
| REDIS_URL | (mesma) |
| ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, ZAPI_WEBHOOK_TOKEN | (mesmas) |
| WHATSAPP_PROVIDER | `zapi` |
| STRIPE_SECRET_KEY, STRIPE_PRICE_ANNUAL, STRIPE_WEBHOOK_SECRET | (mesmas) |
| ANTHROPIC_API_KEY | (mesma) |
| WEB_URL | (mesma) |
| ADMIN_EMAIL, ADMIN_PASSWORD_HASH | (mesmas) |
| NEXTAUTH_SECRET | (mesma) |
| ADMIN_WHATSAPP | (mesma, se houver) |
| SENTRY_DSN | (mesma, se houver) |

> 💡 **Atalho:** Railway tem **"Reference Variables"** — em vez de copiar valores,
> você pode referenciar a env do outro service. Veja a docs do Railway sobre
> "Shared Variables" para usar isso. É opcional mas recomendado.

#### Networking

- **Não exponha o service publicamente.** Os workers só conversam com Redis/Neon
  (saída) e não recebem requests externos. O healthcheck na porta 3001 é
  interno do Railway.

7. Clique **"Deploy"**
8. Aguarde o build (~3-5 min na primeira vez)

### Como verificar que funcionou

1. Service de workers → "Deployments" → últimas linhas dos logs:
   ```
   Lembrymed boot — RUN_MODE=workers
   🤖 Workers process listening for health on port 3001
   Reminder scheduler started (setInterval 60s, tz: America/Sao_Paulo)
   Workers started: scheduler, sender, alerter, lifecycle, ...
   ```
2. Em 1-2 min, deve aparecer (se houver pacientes ativos no horário):
   ```
   Reminders enqueued
   ```

### ✅ Janela sem lembretes encerrada

A partir daqui, os lembretes voltaram a funcionar. Se você fez o PASSO 2 e
o PASSO 3 em sequência, a janela total foi de ~5-8 min.

---

## 📌 PASSO 4 — Rodar o healthcheck completo

Com produção rodando no novo formato, valide tudo:

### Sem terminal — verificação visual

1. **Admin do Lembrymed** (`https://lembrymed.com.br/admin`):
   - Login funciona ✓
   - Dashboard carrega com KPIs reais ✓
   - "Fila" mostra `circuit_breaker: CLOSED` ✓
   - Funil de onboarding em ordem (welcome_sent → ... → active) ✓

2. **Teste de fluxo real** (recomendado):
   - Use um celular de teste para mandar `oi` para o WhatsApp do Lembrymed
   - Resposta deve chegar em <30 segundos
   - Verifique o histórico em `/admin/patient/<seu-número>`

### Com terminal — script automatizado

Se conseguir abrir um terminal (Mac/Linux/WSL):

```bash
cd /caminho/para/o/repositorio

export API_URL="https://SEU-DOMINIO.up.railway.app"
export ADMIN_TOKEN="<token obtido via /admin/login>"
export DATABASE_URL_UNPOOLED="<DSN unpooled do Neon>"

./scripts/production-healthcheck.sh > healthcheck-report.txt 2>&1
```

Manda o arquivo `healthcheck-report.txt` aqui na conversa.

---

## 📌 PASSO 5 — Rollback (se algo der errado)

### Reverter o split (workers de volta no service da API)

1. Service da API → Variables → **REMOVER** `RUN_MODE` (ou setar para `all`)
2. Esperar redeploy (~2 min)
3. Verificar nos logs: `Workers started:` reaparece
4. Pode pausar (ou deletar) o service `lembrymed-workers`

### Reverter as migrations (se necessário — extremamente raro)

As migrations só ADICIONAM colunas. Se algo der errado, o código ainda
funciona porque as colunas ficam como `NULL` (default). **Não precisa
reverter o SQL.**

Se ainda assim quiser remover:
```sql
ALTER TABLE medications DROP COLUMN IF EXISTS deactivated_reason;
ALTER TABLE patients DROP COLUMN IF EXISTS interaction_mode;
DROP INDEX IF EXISTS idx_meds_deactivated_reason;
```

⚠️ **Isso PODE quebrar o código** se ele já estiver tentando ler a coluna.
Faça apenas com o service desligado.

---

## 🆘 Checkpoints — quando me chamar

Me avise (cole aqui na conversa) se em algum passo:

1. SQL do Neon não retornou `OK` duas vezes
2. Service de API ficou em loop de restart depois de mudar `RUN_MODE`
3. Service de workers não inicializou (logs ficam vazios ou com erro)
4. `/admin` parou de funcionar (provavelmente CORS — me avise)
5. Z-API ficou "disconnected" no painel deles
6. Algum paciente reclamou que parou de receber lembretes

Em qualquer dúvida, é **muito melhor** parar e perguntar do que seguir
em frente.

---

## 📝 Resumo em uma frase

> **PASSO 1**: SQL no Neon (2 min)
> **PASSO 2**: `RUN_MODE=api` no service atual (2 min, mas workers param)
> **PASSO 3**: Criar 2º service `lembrymed-workers` com `RUN_MODE=workers` (10 min, workers voltam)
> **PASSO 4**: Validar — visual ou via script (5 min)
> **PASSO 5**: Rollback simples se precisar (remover `RUN_MODE`)
