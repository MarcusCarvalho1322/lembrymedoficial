# CHECKLIST DE MIGRAÇÃO SEGURA — LEMBRYMED

**Data:** 07/07/2026
**Objetivo:** Sequência segura e ordenada para migrar da arquitetura atual (Railway + Vercel) para a arquitetura centralizada (VPS + Docker Compose), sem quebrar o produto em produção.

**Cenário-alvo:** Cenário C (Híbrido Estratégico) — centraliza computação, mantém Neon gerenciado.

---

## LEGENDA

| Símbolo | Significado |
|---------|------------|
| 🔒 | Ação bloqueante — não prossiga sem completar |
| 👤 | Requer intervenção humana (Marcus) |
| 🤖 | Pode ser automatizado / executado pelo agente |
| ⚠️ | Atenção: risco de perda de dados ou downtime |
| ✅ | Verificação — confirme manualmente |

---

## FASE 0 — PRÉ-MIGRAÇÃO (preparação)

### 0.1 — Backup completo do projeto
- [ ] 🔒👤 **Baixar uma cópia completa do repositório** para seu computador local (já está em `C:\Users\marcu\OneDrive\LEMBRYMED PROJECT`)
- [ ] 🔒👤 **Criar backup offline** (zip do projeto inteiro em HD externo ou nuvem)
- [ ] ✅ Verificar que `git status` está limpo (sem alterações não commitadas)

### 0.2 — Backup do banco de dados atual (Neon)
- [ ] 🔒👤 **Fazer dump do banco de produção atual:**
  ```bash
  pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --file=lembrymed_pre_migracao_$(date +%Y%m%d).dump
  ```
- [ ] ✅ Verificar tamanho do dump (`ls -lh *.dump` > 0 bytes)
- [ ] 🔒👤 **Guardar o dump em local seguro** (Google Drive, S3, HD externo)
- [ ] 👤 Se possível, testar o restore em um banco Neon preview branch

### 0.3 — Cópia de variáveis de ambiente
- [ ] 🔒👤 **Exportar todas as env vars do Railway** (via dashboard Railway → Settings → Environment)
- [ ] 🔒👤 **Exportar todas as env vars do Vercel** (via dashboard Vercel → Settings → Environment Variables)
- [ ] 👤 Salvar em arquivo criptografado ou gerenciador de senhas (não em texto puro no desktop)
- [ ] ✅ Verificar que a lista de vars confere com `.env.example` (33 variáveis)

### 0.4 — Criação de branch para a migração
- [ ] 🤖 Criar branch `audit/hermes-centralizacao-infra` a partir de `main`
  ```bash
  git checkout main
  git pull origin main
  git checkout -b audit/hermes-centralizacao-infra
  ```
- [ ] 🤖 Commitar os documentos de auditoria nesta branch:
  - `AUDITORIA_TECNICA_HERMES.md`
  - `MATRIZ_CENTRALIZACAO_CUSTOS.md`
  - `PLANO_IMPLANTACAO_GITHUB.md`
  - `ARQUITETURA_CENTRALIZADA_PROPOSTA.md`
  - `CHECKLIST_MIGRACAO_SEGURA.md` (este arquivo)

### 0.5 — Verificação do CI
- [ ] 🤖 Copiar `AUDIT/CI-SUGGESTED.yml` → `.github/workflows/ci.yml`
- [ ] 🤖 Criar PR e verificar que CI passa (typecheck + build + test)
- [ ] ✅ 27 testes devem passar
- [ ] ✅ Build do web deve passar
- [ ] ✅ Typecheck da API deve passar

---

## FASE 1 — DOCKERIZAÇÃO (local)

### 1.1 — Criar arquivos de infraestrutura (sem alterar código)
- [ ] 🤖 Criar `docker-compose.yml` (dev local — API + Web + Redis + Postgres local)
- [ ] 🤖 Criar `docker-compose.prod.yml` (produção — sem Postgres, usa Neon)
- [ ] 🤖 Criar `Caddyfile` (reverse proxy com SSL)
- [ ] 🤖 Criar `apps/web/Dockerfile` (Next.js standalone)
- [ ] 🤖 Criar `apps/api/Dockerfile` — já existe, verificar se está atualizado
- [ ] 🤖 Criar `.env.example` atualizado (já existe, verificar)
- [ ] 🤖 Criar `scripts/backup.sh`
- [ ] 🤖 Criar `scripts/deploy.sh`
- [ ] 🤖 Criar `scripts/restore.sh`
- [ ] 🤖 Criar `scripts/healthcheck.sh`

### 1.2 — Teste local com Docker Compose
- [ ] 🤖 Rodar `docker compose up -d` (modo dev, com Postgres local)
- [ ] ✅ Verificar `docker compose ps` — todos os serviços UP
- [ ] ✅ `curl http://localhost:3000/health` → `{"status":"ok"}`
- [ ] ✅ `curl http://localhost:3001` → landing page carrega
- [ ] ✅ Testar login admin (se tiver banco seedado)
- [ ] 🤖 Rodar `npm test` dentro do container API → 27 testes passam

### 1.3 — Ajustes necessários no código
- [ ] ⚠️ Atualizar `next.config.js` para `output: 'standalone'`
- [ ] ⚠️ Verificar se `@neondatabase/serverless` funciona de dentro do Docker (deve funcionar — é HTTP)
- [ ] ⚠️ Se necessário, ajustar CORS para aceitar novo domínio

---

## FASE 2 — AMBIENTE STAGING

### 2.1 — Provisionar VPS de staging
- [ ] 👤 Contratar VPS (Hetzner CX22 ~€4/mês ou DigitalOcean $6/mês)
- [ ] 👤 Configurar domínio staging (ex: `staging.lembrymed.com.br`)
- [ ] 👤 Configurar DNS A record → IP da VPS
- [ ] 🤖 Instalar Docker + Docker Compose na VPS:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

### 2.2 — Criar branch Neon de staging
- [ ] 👤 No dashboard Neon: criar branch `staging` a partir de `main`
- [ ] 👤 Obter DATABASE_URL e DATABASE_URL_UNPOOLED do branch staging

### 2.3 — Deploy em staging
- [ ] 🤖 Clonar repositório na VPS:
  ```bash
  git clone https://github.com/MarcusCarvalho1322/lembrymed.git /opt/lembrymed
  cd /opt/lembrymed
  git checkout audit/hermes-centralizacao-infra
  ```
- [ ] 🤖 Configurar `.env` na VPS com valores do Neon staging
- [ ] 🤖 Rodar `docker compose -f docker-compose.prod.yml up -d`
- [ ] ✅ Verificar healthcheck: `curl https://staging.lembrymed.com.br/health`
- [ ] ✅ Verificar landing page: acessar `https://staging.lembrymed.com.br`

### 2.4 — Testes em staging (validação completa)

#### Validação de autenticação
- [ ] ✅ Login admin funciona (`/admin/login`)
- [ ] ✅ Token JWT é retornado e válido
- [ ] ✅ Dashboard carrega com dados do banco staging
- [ ] ✅ Rate limit funciona (6 tentativas em 15min → 429)

#### Validação de uploads / mídia
- [ ] ✅ Imagens da landing carregam (logo, OG images)
- [ ] ✅ Fontes carregam (DM Sans, Playfair, Cinzel, Cormorant)

#### Validação de webhooks
- [ ] ✅ `POST /webhook/stripe` com segredo válido retorna 200 (mesmo sem evento real)
- [ ] ⚠️ `POST /webhook/whatsapp` testar com token ZAPI_WEBHOOK_TOKEN válido

#### Validação de APIs externas
- [ ] ✅ Anthropic: criar paciente de teste → onboarding via staging (usar API key de dev)
- [ ] ✅ Stripe: criar checkout session em modo teste (`sk_test_`)
- [ ] ⚠️ Z-API: testar envio de mensagem para número de teste (se tiver instância de dev)

#### Validação de performance
- [ ] ✅ `GET /health` < 200ms
- [ ] ✅ `GET /admin/dashboard` < 1000ms
- [ ] ✅ Landing page Lighthouse: LCP < 2.5s, CLS < 0.1

#### Validação de logs
- [ ] ✅ `docker compose logs api` mostra logs estruturados (Winston)
- [ ] ✅ Logs de erro aparecem quando algo falha (testar com webhook inválido)

#### Validação de backups
- [ ] 🤖 Rodar `scripts/backup.sh` manualmente
- [ ] ✅ Verificar que o dump foi gerado (`ls -lh /opt/lembrymed/data/backups/`)
- [ ] 🤖 Rodar `scripts/restore.sh` em banco staging separado
- [ ] ✅ Verificar que dados foram restaurados

---

## FASE 3 — MIGRAÇÃO DO BANCO (se aplicável)

> ⚠️ **No Cenário C (Híbrido), o banco permanece no Neon. Esta fase só se aplica ao Cenário B (centralização total).**

### 3.1 — Se for migrar Neon → PostgreSQL self-hosted
- [ ] 🔒 Fazer dump completo do Neon produção:
  ```bash
  pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --no-owner --no-acl > prod_full.dump
  ```
- [ ] 🔒 Restaurar em PostgreSQL container na VPS:
  ```bash
  pg_restore --dbname=lembrymed prod_full.dump
  ```
- [ ] 🔒 Atualizar `DATABASE_URL` para apontar para o container PostgreSQL
- [ ] 🔒 Substituir driver `@neondatabase/serverless` por `pg` (TCP) no `packages/database/index.ts`
- [ ] ⚠️ Isso requer alteração de código → Fase 6

---

## FASE 4 — CORTE PARA PRODUÇÃO

### 4.1 — Preparação
- [ ] 👤 Provisionar VPS de produção (separada da staging)
- [ ] 👤 Configurar DNS: `lembrymed.com.br` → IP da VPS produção
- [ ] 👤 Configurar DNS: `api.lembrymed.com.br` → IP da VPS produção (se usar subdomínio)
- [ ] 🔒 Copiar `.env` de produção para `/opt/lembrymed/.env` na VPS
- [ ] 🔒 `chmod 600 /opt/lembrymed/.env`

### 4.2 — Deploy produção
- [ ] 🤖 `git checkout main` (branch estável, testada em staging)
- [ ] 🤖 `docker compose -f docker-compose.prod.yml up -d --build`
- [ ] ✅ `curl https://lembrymed.com.br/health` → `{"status":"ok"}`
- [ ] ✅ Landing page carrega em `https://lembrymed.com.br`
- [ ] ✅ Admin funciona em `https://lembrymed.com.br/admin`

### 4.3 — Atualizar webhooks externos
- [ ] 👤 **Stripe Dashboard** → Developers → Webhooks → atualizar URL:
  - De: `https://lembrymed-api-production.up.railway.app/webhook/stripe`
  - Para: `https://lembrymed.com.br/webhook/stripe`
- [ ] 👤 **Z-API Dashboard** → Settings → Webhook URL → atualizar:
  - De: `https://lembrymed-api-production.up.railway.app/webhook/whatsapp`
  - Para: `https://lembrymed.com.br/webhook/whatsapp`
- [ ] ✅ Verificar que webhooks estão chegando (enviar evento de teste via Stripe)

### 4.4 — Monitorar
- [ ] ✅ Healthcheck UptimeRobot/Sentry apontando para `https://lembrymed.com.br/health`
- [ ] ✅ Verificar filas BullMQ: `GET /admin/queue` mostra jobs processando
- [ ] ✅ Verificar logs: `docker compose logs -f api` (sem erros)

### 4.5 — Smoke test completo
- [ ] ✅ Fazer checkout real com cartão de teste → onboarding → lembrete → confirmação
- [ ] ✅ Verificar alerta familiar (esperar 30min após não-confirmação)
- [ ] ✅ Verificar painel admin: dashboard, pacientes, receita, fila

---

## FASE 5 — ROLLBACK PREPARADO

### 5.1 — Plano B: voltar para Railway + Vercel
- [ ] 👤 Manter serviço Railway **pausado** (não deletado) por 7 dias após migração
- [ ] 👤 Manter projeto Vercel **ativo** por 7 dias após migração
- [ ] 👤 Documentar procedimento de rollback de DNS (voltar A record para Vercel)
- [ ] 👤 Documentar procedimento de rollback de webhook (voltar URL para Railway)

### 5.2 — Como fazer rollback em emergência:
```bash
# 1. DNS: apontar lembrymed.com.br de volta para Vercel
# 2. Stripe webhook: voltar URL para Railway
# 3. Z-API webhook: voltar URL para Railway
# 4. Railway: despausar serviço → deploy automático
# Tempo total estimado: 10-15 minutos
```

---

## FASE 6 — PÓS-MIGRAÇÃO (estabilização)

### 6.1 — Monitoramento
- [ ] ✅ Configurar UptimeRobot para `https://lembrymed.com.br/health` (intervalo 5min)
- [ ] ✅ Configurar alerta: se healthcheck falhar 3x seguidas → notificar WhatsApp
- [ ] ✅ Verificar consumo de recursos na VPS: `docker stats`

### 6.2 — Backup automático
- [ ] 🤖 Configurar cron na VPS para `scripts/backup.sh` (3:00 AM BRT)
- [ ] 👤 Configurar S3/Backblaze B2 para backup offsite
- [ ] ✅ Verificar que backups estão sendo gerados diariamente

### 6.3 — Logs
- [ ] ✅ Verificar rotação de logs Docker (max-size: 10m, max-file: 3)
- [ ] ✅ Configurar log aggregation se necessário (Loki ou SaaS)

### 6.4 — Descomissionar serviços antigos (após 7 dias estáveis)
- [ ] 👤 Deletar serviço Railway (depois de confirmar que VPS está estável)
- [ ] 👤 Deletar projeto Vercel ou manter como backup frio
- [ ] 👤 Atualizar documentação com novos endpoints

### 6.5 — Documentação final
- [ ] 🤖 Atualizar `README.md` com nova arquitetura
- [ ] 🤖 Atualizar `DEPLOY.md` com procedimento de deploy na VPS
- [ ] 🤖 Criar `README_DEPLOY.md` para humanos não técnicos

---

## RESUMO DA ORDEM DE EXECUÇÃO

```
Fase 0 (Pré-migração)
  ├── 0.1 Backup do projeto
  ├── 0.2 Backup do banco
  ├── 0.3 Cópia de env vars
  ├── 0.4 Branch da migração
  └── 0.5 CI ativo
       │
Fase 1 (Dockerização)
  ├── 1.1 Criar arquivos (compose, Dockerfiles, scripts)
  ├── 1.2 Teste local
  └── 1.3 Ajustes de código
       │
Fase 2 (Staging)
  ├── 2.1 VPS staging
  ├── 2.2 Neon branch staging
  ├── 2.3 Deploy staging
  └── 2.4 Validação completa
       │
Fase 3 (Migração do banco) ← OPCIONAL no Cenário C
       │
Fase 4 (Produção)
  ├── 4.1 VPS produção + DNS
  ├── 4.2 Deploy produção
  ├── 4.3 Atualizar webhooks
  ├── 4.4 Monitorar
  └── 4.5 Smoke test
       │
Fase 5 (Rollback)
  ├── 5.1 Manter Railway + Vercel 7 dias
  └── 5.2 Procedimento de emergência
       │
Fase 6 (Estabilização)
  ├── 6.1 Monitoramento
  ├── 6.2 Backup automático
  ├── 6.3 Logs
  ├── 6.4 Descomissionar antigos
  └── 6.5 Documentação
```

**Tempo total estimado:** 1-2 semanas (trabalhando com cautela, validando cada etapa).
