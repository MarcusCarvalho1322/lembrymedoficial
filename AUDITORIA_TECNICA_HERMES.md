# AUDITORIA TÉCNICA HERMES — LEMBRYMED

**Data:** 07/07/2026
**Auditor:** Hermes Agent (modo leitura, sem alterações)
**Escopo:** `C:\Users\marcu\OneDrive\LEMBRYMED PROJECT` (repositório completo)
**Versão do código:** v2.10-audit (CHANGELOG) / v2.11-obs (health endpoint)

---

## 1. RESUMO EXECUTIVO

O **Lembrymed** é um SaaS healthtech brasileiro (BIZZ.IA Intelligence Ecosystem) que envia lembretes de medicação via WhatsApp e alerta familiares quando o paciente não confirma a tomada. Opera com um modelo de assinatura anual via Stripe (R$ 149/ano) e onboarding conversacional via Claude (Anthropic).

**Arquitetura atual:** monorepo Turborepo com 2 apps (API Express no Railway + Next.js 14 no Vercel), 2 packages internos (database + shared), banco Neon PostgreSQL serverless, Redis no Railway, fila BullMQ, WhatsApp via Z-API, pagamentos Stripe, IA Anthropic Claude.

**Estado geral:** O produto funciona e o fluxo crítico (lembrete) é bem projetado. A segurança foi significativamente melhorada numa auditoria anterior (abril/2026). Porém, a arquitetura atual tem **5 plataformas pagas ativas** (Railway, Vercel, Neon, Z-API, Stripe + Anthropic e Redis integrados no Railway), gerando acoplamento com 4 provedores serverless/cloud e custo operacional distribuído e difícil de prever.

---

## 2. MAPA DA ARQUITETURA ATUAL

```
┌──────────────────────────────────────────────────────────────┐
│                    USUÁRIOS EXTERNOS                          │
│  Paciente (WhatsApp) │ Familiar (WhatsApp) │ Admin (Browser)  │
└──────┬──────────────────────┬─────────────────────┬──────────┘
       │                      │                     │
       ▼                      ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐
│   Z-API      │    │   Z-API      │    │  Vercel (Next.js 14) │
│  (Brasil)    │    │  (Brasil)    │    │  - Landing page      │
│  ~R$49/mês   │    │              │    │  - Admin UI (JWT)    │
└──────┬───────┘    └──────┬───────┘    │  - Checkout Stripe   │
       │                   │            │  - /privacidade      │
       │ webhook           │ envio      │  - /termos           │
       ▼                   │            └──────────┬───────────┘
┌──────────────────────────────────────────┐        │
│       Railway (Express + BullMQ)         │◄───────┘ JWT Bearer
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  API Express (porta 3000)       │    │
│  │  - /webhook/whatsapp (Z-API)    │    │
│  │  - /webhook/stripe              │    │
│  │  - /admin/* (JWT protegido)     │    │
│  │  - /health, /metrics            │    │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  6 Workers (mesmo processo)     │    │
│  │  - Reminder Scheduler (1/min)   │    │
│  │  - Reminder Sender (BullMQ)     │    │
│  │  - Family Alerter (BullMQ 30m)  │    │
│  │  - Lifecycle (09:00 BRT cron)   │    │
│  │  - Onboarding Nudge (60min)     │    │
│  │  - Z-API Health (5min)          │    │
│  └─────────────────────────────────┘    │
│                                          │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │  Redis   │  │  BullMQ (2 filas)    │ │
│  │ (Railway)│  │  - send-reminder     │ │
│  │          │  │  - family-alert      │ │
│  └──────────┘  └──────────────────────┘ │
└─────────────┬────────────────────────────┘
              │
    ┌─────────┴──────────┐
    ▼                    ▼
┌──────────────┐  ┌─────────────────┐
│  Neon PG     │  │  Anthropic      │
│  Serverless  │  │  Claude API     │
│  (Drizzle)   │  │  Sonnet + Haiku │
└──────────────┘  └─────────────────┘
         │
    ┌────┴────┐
    │ Stripe  │
    │(pgto)   │
    └─────────┘
```

**Fluxo principal:**
1. Landing → Checkout → Stripe → Webhook → cria paciente + WhatsApp boas-vindas
2. Paciente responde → Z-API webhook → Claude conduz onboarding → cadastra medicamentos
3. Scheduler 1/min → enfileira lembretes → Sender envia via Z-API
4. Paciente confirma (SIM/NÃO) → webhook → registra + (se não confirmar) alerta familiar
5. Lifecycle diário: renovação, suspensão, LGPD retention, relatório mensal

---

## 3. ÁRVORE SIMPLIFICADA DO PROJETO

```
LEMBRYMED PROJECT/
├── .env.example                    ← 72 linhas, 26 variáveis
├── .dockerignore
├── .gitignore
├── package.json                    ← npm workspaces + Turborepo 2.0
├── turbo.json                      ← build/dev/lint/typecheck/test tasks
├── tsconfig.json                   ← ES2022, commonjs, strict
├── vercel.json                     ← build web no Vercel
├── railway.toml                    ← deploy API no Railway (Dockerfile)
├── railway.workers.toml            ← workers separados (RUN_MODE=workers)
├── CHANGELOG.md
├── README.md
├── DEPLOY.md
├── index.ts                        ← (raiz) bootstrap Express
├── layout.tsx                      ← (raiz) layout admin antigo (legacy?)
│
├── apps/
│   ├── api/                        ← @lembrymed/api (Express + BullMQ)
│   │   ├── Dockerfile              ← node:20-slim, esbuild bundle
│   │   ├── package.json            ← 11 deps prod, 8 dev
│   │   └── src/
│   │       ├── index.ts            ← bootstrap Express + workers
│   │       ├── boot/               ← api-server.ts, workers-runner.ts
│   │       ├── config/             ← env.ts, redis.ts, queues.ts, sentry.ts
│   │       ├── middleware/         ← auth.ts, rateLimit.ts, auditLog.ts, ...
│   │       ├── routes/
│   │       │   ├── webhooks/       ← stripe.ts, whatsapp.ts (+ handlers/)
│   │       │   └── admin/          ← dashboard, patients, renewals, queue
│   │       ├── workers/            ← 6 workers BullMQ + node-cron
│   │       ├── services/           ← stripe.service.ts
│   │       ├── clients/            ← dialog360.client.ts (WhatsAppClient)
│   │       ├── lib/                ← brt.ts, scheduling.ts, med-schedule-cache...
│   │       └── __tests__/          ← 27 testes Vitest
│   │
│   └── web/                        ← @lembrymed/web (Next.js 14)
│       ├── Dockerfile              ← (simples, 4 linhas)
│       ├── package.json            ← next, react, framer-motion, stripe, zod
│       ├── app/                    ← App Router
│       │   ├── layout.tsx          ← fonts, metadata, OG/Twitter cards
│       │   ├── page.tsx            ← landing page
│       │   ├── checkout/page.tsx
│       │   ├── success/page.tsx
│       │   ├── privacidade/page.tsx
│       │   ├── termos/page.tsx
│       │   └── admin/              ← painel admin (layout, dashboard, patients...)
│       ├── components/
│       │   ├── landing/            ← LembrymedLanding.tsx (~550 linhas)
│       │   ├── admin/              ← charts.tsx
│       │   └── ui/                 ← gradient-hero.tsx
│       └── lib/                    ← api.ts, auth-context.tsx
│
├── packages/
│   ├── database/                   ← @lembrymed/database (Drizzle ORM + Neon)
│   │   ├── package.json            ← drizzle-orm, @neondatabase/serverless
│   │   ├── schema.ts               ← 11 tabelas + enums + relations (349 linhas)
│   │   ├── index.ts                ← conexão Neon + drizzle init
│   │   ├── drizzle.config.ts
│   │   ├── migrations/             ← 6 arquivos SQL (.0001 a .0006)
│   │   └── seed.ts, wipe-*.ts, ...
│   │
│   └── shared/                     ← @lembrymed/shared
│       ├── package.json            ← winston, zod
│       └── (logger, types, privacy helpers)
│
├── docs/                           ← 12 documentos
│   ├── ARQUITETURA.md
│   ├── FLUXOS-CRITICOS.md
│   ├── RUNBOOK.md
│   ├── ROADMAP.md
│   ├── LGPD.md
│   └── ...
│
├── AUDIT/                          ← Relatórios da auditoria anterior (abril/2026)
│   ├── 00-sumario-executivo.md
│   ├── CI-SUGGESTED.yml
│   ├── RISCOS-RESIDUAIS.md
│   └── ...
│
├── lembrymed-fix-media/            ← (sub-repositório separado)
├── scripts/                        ← scripts avulsos
└── (imagens e assets soltos na raiz)
```

---

## 4. STACK IDENTIFICADA

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Linguagem** | TypeScript | 5.5+ |
| **Runtime** | Node.js | 20 (Docker: node:20-slim) |
| **Monorepo** | npm workspaces + Turborepo | 2.0 |
| **Frontend** | Next.js (App Router) | 15.5.16 |
| **Frontend UI** | React, framer-motion | 18.3 / 12.39 |
| **Backend API** | Express.js | 4.19 |
| **ORM / Database** | Drizzle ORM + Neon Serverless | 0.45.2 / 0.10 |
| **Banco de dados** | PostgreSQL (Neon serverless) | — |
| **Fila / Jobs** | BullMQ | 5.8 |
| **Cache / Fila Backend** | Redis (via ioredis) | 5.4 |
| **Cron** | node-cron | 3.0.3 |
| **IA** | Anthropic Claude (Sonnet 4.6 + Haiku 4.5) | SDK 0.30 |
| **WhatsApp** | Z-API (provider principal) | — |
| **Pagamentos** | Stripe | 15.0 |
| **Autenticação** | JWT (jsonwebtoken + bcryptjs) | 9.0 / 2.4 |
| **Validação** | Zod | 3.23 |
| **Logging** | Winston | 3.13 |
| **Observabilidade** | Sentry (opcional) | — |
| **Testes** | Vitest | 1.6.1 |
| **Build API** | esbuild (bundle) | 0.21 |
| **Dev runner** | tsx | 4.19.4 |
| **Bundle fix** | esbuild override | 0.25.8 (raiz) |

---

## 5. PLATAFORMAS EXTERNAS ENCONTRADAS

| # | Plataforma | Função | Modelo | Custo estimado |
|---|-----------|--------|--------|---------------|
| 1 | **Railway** | Hospedagem API Express + Workers + Redis | PaaS | ~$20-25/mês (estimado) |
| 2 | **Vercel** | Hospedagem Frontend Next.js | Serverless | Free (Hobby) ou $20/mês (Pro) |
| 3 | **Neon** | PostgreSQL Serverless | Serverless | Free tier (0.5GB) ou $19/mês Launch |
| 4 | **Z-API** | WhatsApp Business API (não-oficial) | SaaS | ~R$49/mês (~$10) |
| 5 | **Stripe** | Gateway de pagamento | SaaS | % por transação |
| 6 | **Anthropic** | Claude API (IA conversacional) | API paga por token | Variável (~$0.10-1.00/mês em baixo volume) |
| 7 | **Sentry** | Observabilidade (opcional) | SaaS | Free tier ou $26/mês |
| 8 | **GitHub** | Repositório + CI Actions | SaaS | Free |

**Nota:** Redis está provisionado como addon do Railway (incluído no custo Railway, não é plataforma separada).

---

## 6. TABELA DE SERVIÇOS PAGOS OU POTENCIALMENTE PAGOS

| Serviço | Plano atual | Custo mensal est. | Pode migrar para self-hosted? | Risco da migração |
|---------|------------|-------------------|-------------------------------|-------------------|
| Railway (API) | Hobby/Pro | $20-25 | Sim (VPS Docker) | Médio — exige Dockerfile + compose |
| Vercel (Web) | Hobby | $0-20 | Sim (mesma VPS, Nginx/Caddy) | Baixo — Next.js roda em qualquer Node |
| Neon (DB) | Free (0.5GB) | $0-19 | Sim (PostgreSQL container) | Alto — dados de saúde, backup, cold-start |
| Z-API (WhatsApp) | Pago | ~$10 | Não (não há alternativa self-hosted viável) | Crítico — core do produto |
| Stripe | Pay-as-you-go | Variável | Não (gateway regulado) | Crítico — compliance financeiro |
| Anthropic | Pay-per-token | $0-5 | Parcial (modelos open-source via Ollama) | Alto — qualidade da conversa |
| Redis (Railway) | Integrado | $0 (incluso) | Sim (container Redis) | Baixo |
| Sentry | Não ativo | $0 | Sim (alternativas open-source) | Nenhum |

---

## 7. TABELA DE VARIÁVEIS DE AMBIENTE (apenas nomes e finalidade)

| # | Nome da variável | Finalidade estimada |
|---|---|---|
| 1 | `NODE_ENV` | Ambiente: development / test / production |
| 2 | `DATABASE_URL` | Conexão Neon PostgreSQL (pooled, para runtime) |
| 3 | `DATABASE_URL_UNPOOLED` | Conexão Neon direta (para drizzle-kit/migrations) |
| 4 | `REDIS_URL` | Conexão Redis (BullMQ + cache + dedup) |
| 5 | `WHATSAPP_PROVIDER` | Provider WhatsApp: zapi / 360dialog / meta / twilio |
| 6 | `ZAPI_INSTANCE_ID` | ID da instância Z-API |
| 7 | `ZAPI_TOKEN` | Token da instância Z-API |
| 8 | `ZAPI_CLIENT_TOKEN` | Client token Z-API |
| 9 | `ZAPI_WEBHOOK_TOKEN` | Token de segurança do webhook Z-API (obrigatório em prod) |
| 10 | `DIALOG_API_KEY` | API key 360dialog (provider alternativo, opcional) |
| 11 | `DIALOG_PHONE_NUMBER_ID` | Phone number ID 360dialog (opcional) |
| 12 | `META_ACCESS_TOKEN` | Token Meta Cloud API (opcional) |
| 13 | `META_PHONE_NUMBER_ID` | Phone number ID Meta (opcional) |
| 14 | `TWILIO_ACCOUNT_SID` | Twilio SID (opcional) |
| 15 | `TWILIO_AUTH_TOKEN` | Twilio auth token (opcional) |
| 16 | `TWILIO_WHATSAPP_FROM` | Número Twilio WhatsApp (opcional) |
| 17 | `STRIPE_SECRET_KEY` | Chave secreta Stripe (sk_live_ ou sk_test_) |
| 18 | `STRIPE_WEBHOOK_SECRET` | Segredo do webhook Stripe (whsec_) |
| 19 | `STRIPE_PRICE_ANNUAL` | ID do preço anual no Stripe (price_) |
| 20 | `STRIPE_PUBLISHABLE_KEY` | Chave pública Stripe (não-secreta) |
| 21 | `ANTHROPIC_API_KEY` | API key Anthropic Claude (sk-ant-) |
| 22 | `API_URL` | URL pública da API (opcional) |
| 23 | `WEB_URL` | URL pública do site |
| 24 | `ADMIN_EMAIL` | Email do admin para login JWT |
| 25 | `ADMIN_PASSWORD_HASH` | Hash bcrypt da senha admin |
| 26 | `NEXTAUTH_SECRET` | Segredo JWT para tokens admin (mín 32 chars) |
| 27 | `ADMIN_WHATSAPP` | WhatsApp do admin para alertas críticos (opcional) |
| 28 | `SENTRY_DSN` | Sentry DSN para captura de erros (opcional) |
| 29 | `LOG_LEVEL` | Nível de log: debug / info / warn / error |
| 30 | `METRICS_SECRET` | Segredo para proteger /metrics (opcional) |
| 31 | `PORT` | Porta do servidor Express (default: 3000) |
| 32 | `NEXT_PUBLIC_API_URL` | URL da API exposta ao frontend |
| 33 | `NEXT_PUBLIC_WEB_URL` | URL pública do site (frontend) |

**Variáveis do CI (GitHub Actions):** valores dummy de `DATABASE_URL`, `REDIS_URL`, `STRIPE_*`, `ANTHROPIC_API_KEY`, `ADMIN_*`, `NEXTAUTH_SECRET`, `ZAPI_*`.

---

## 8. FLUXO ATUAL DE BUILD

### API (apps/api)
1. `Dockerfile` em `apps/api/Dockerfile`
2. Base: `node:20-slim`
3. Copia `package.json`, `package-lock.json`, `turbo.json`, `tsconfig.json`
4. `npm install` (instala todas as dependências do workspace)
5. Copia código fonte (`packages/` + `apps/api/`)
6. **esbuild bundle:** compila `apps/api/src/index.ts` → `apps/api/dist/server.js` com externals (ioredis, @neondatabase/serverless, bcryptjs, node-cron, semver, luxon, uuid)
7. `CMD ["node", "apps/api/dist/server.js"]`

### Web (apps/web)
1. Build via Vercel (comando em `vercel.json`: `cd apps/web && npm run build`)
2. `next build` — gera `.next/` (SSG/SSR)

### CI (GitHub Actions — não ativo)
- Workflow sugerido em `AUDIT/CI-SUGGESTED.yml`
- Steps: checkout → setup-node → npm install → tsc (API) → next build (web) → vitest (API)
- **Status:** arquivo não está em `.github/workflows/` (precisa ser copiado manualmente; PAT sem escopo `workflow` na época)

---

## 9. FLUXO ATUAL DE DEPLOY

### Railway (API)
- Build: Dockerfile automático detectado pelo Railway
- Healthcheck: `GET /health` a cada ~30s
- Deploy: via `railway up` CLI ou git push (se conectado)
- Workers: serviço separado `lembrymed-workers` com `RUN_MODE=workers`

### Vercel (Web)
- Root directory: raiz do monorepo
- Build command: `cd apps/web && npm run build`
- Output: `apps/web/.next`
- Deploy: automático via git push (GitHub integration) ou `vercel --prod`

### Neon (Banco)
- Migrations manuais via `psql` ou `drizzle-kit push`
- Workflow seguro: branch preview → testar → promover para main

---

## 10. BANCO DE DADOS ATUAL

**Motor:** PostgreSQL (Neon serverless)
**ORM:** Drizzle ORM v0.45.2
**Driver:** `@neondatabase/serverless` v0.10.4 (HTTP, não TCP)
**Schema:** 11 tabelas + 7 enums + relações

### Tabelas
| # | Tabela | Função | Linhas schema |
|---|--------|--------|--------------|
| 1 | `patients` | Pacientes (nome, telefone, onboarding_step, whatsapp_id) | Core |
| 2 | `family_contacts` | Contatos de familiares por paciente | Core |
| 3 | `subscriptions` | Assinaturas Stripe (plano, status, expiração) | Core |
| 4 | `medications` | Medicamentos (nome, dosagem, horários array) | Core |
| 5 | `reminder_logs` | Log de lembretes enviados | Core |
| 6 | `medication_confirmations` | Confirmações de tomada (SIM/NÃO) | Core |
| 7 | `message_logs` | Log de mensagens WhatsApp (inbound/outbound) | Core |
| 8 | `family_alert_logs` | Alertas enviados a familiares | Core |
| 9 | `system_config` | Configurações do sistema (key-value) | Sistema |
| 10 | `consent_logs` | Registros de consentimento LGPD | LGPD |
| 11 | `privacy_policies` | Versões da política de privacidade | LGPD |
| 12 | `admin_audit_logs` | Auditoria de ações admin | LGPD |
| 13 | `lgpd_incidents` | Incidentes LGPD (exclusão, vazamento) | LGPD |

### Migrations
| # | Arquivo | Status |
|---|---------|--------|
| 0001 | `onboarding_nudge_count.sql` | Aplicado em produção |
| 0002 | `cascade_and_lgpd_tables.sql` | Pendente (PR #4) |
| 0003 | `drop_legacy_prisma_fks.sql` | Em dev |
| 0004 | `reminder_type_enum_migration.sql` | Em dev |
| 0005 | `medications_deactivated_reason.sql` | Em dev |
| 0006 | `patients_interaction_mode.sql` | Em dev |

### Conexão
- `DATABASE_URL` (pooled): usado em runtime (API + workers). Ex: `postgresql://user:***@ep-xxx-pooler.us-east-2.aws.neon.tech/lembrymed?sslmode=require`
- `DATABASE_URL_UNPOOLED`: usado para drizzle-kit. Ex: `postgresql://user:***@ep-xxx.us-east-2.aws.neon.tech/lembrymed?sslmode=require`
- **Conexão:** via HTTP (Neon serverless driver), não TCP tradicional

---

## 11. PONTOS DE ACOPLAMENTO COM PLATAFORMAS PAGAS

### Acoplamento FORTE (quebra o produto se remover)
| Plataforma | Por que é crítico |
|-----------|-------------------|
| **Z-API** | Único canal de comunicação com pacientes. WhatsApp é o core do produto. Sem Z-API, não há lembretes, onboarding, confirmações. |
| **Stripe** | Único meio de cobrança. Sem Stripe, não há receita. |
| **Anthropic Claude** | Conduz o onboarding conversacional e extrai medicamentos. Sem Claude, onboarding quebra. |

### Acoplamento MÉDIO (quebra com adaptação viável)
| Plataforma | Por que é substituível |
|-----------|----------------------|
| **Railway** | API Express + workers + Redis podem rodar em qualquer VPS com Docker Compose. Dockerfile já existe. |
| **Vercel** | Next.js pode rodar em qualquer servidor Node (standalone mode) ou atrás de Nginx/Caddy. |
| **Neon** | PostgreSQL pode ser self-hosted em container Docker. Migração requer dump + restore. |

### Acoplamento BAIXO (já é opcional ou facilmente migrável)
| Plataforma | Por que é baixo |
|-----------|----------------|
| **Redis (Railway)** | Redis já é um container; pode rodar em qualquer lugar. |
| **Sentry** | Totalmente opcional; env var `SENTRY_DSN` não definida = zero impacto. |

---

## 12. RISCOS TÉCNICOS

| Risco | Severidade | Descrição |
|-------|-----------|-----------|
| **Single point of failure: Z-API** | 🔴 Crítico | Se Z-API cair, 100% dos lembretes param. Worker `zapi-health` alerta, mas não resolve. |
| **Workers no mesmo processo da API** | 🟠 Alto | Se a API crasha, todos os 6 workers caem junto. Sem lembretes até reinício. |
| **Neon cold-start latency** | 🟡 Médio | 100-400ms em primeira query após inatividade. Já otimizado com cache Redis. |
| **Neon Scale to Zero ineficaz** | 🟡 Médio | Scheduler 1/min impede suspensão do compute. Já documentado (Item 49 RISCOS-RESIDUAIS). |
| **Dockerfile com esbuild** | 🟡 Médio | Bundle externals manual (ioredis, neon, bcryptjs). Se upgrade quebrar compatibilidade, build falha silenciosamente. |
| **Sem docker-compose** | 🟡 Médio | Não há orquestração local; dev depende de serviços externos (Neon, Redis). |
| **Monorepo Turborepo** | 🟢 Baixo | Bem configurado, mas adiciona complexidade de build. |
| **npm workspaces (não pnpm)** | 🟢 Baixo | npm é mais lento e consome mais disco que pnpm, mas funcional. |

---

## 13. RISCOS DE SEGURANÇA

| Risco | Severidade | Estado |
|-------|-----------|--------|
| **JWT admin em localStorage** | 🟠 Alto | Vulnerável a XSS. Mitigação parcial: CSP restritivo + security headers. Roadmap: migrar para cookie HttpOnly. |
| **NEXTAUTH_SECRET obrigatório** | ✅ Resolvido | Antes tinha fallback inseguro `'dev-secret-change-me'`. Agora fail-fast. |
| **ZAPI_WEBHOOK_TOKEN obrigatório** | ✅ Resolvido | Webhook agora exige token com timingSafeEqual em produção. |
| **Rate limit no login** | ✅ Resolvido | 5 tentativas / 15 min por IP + email. |
| **Stripe webhook idempotência** | ✅ Resolvido | Redis SET NX TTL 24h no event.id. |
| **CORS restritivo** | ✅ Resolvido | Whitelist explícita no middleware. |
| **Security headers** | ✅ Resolvido | HSTS, X-Frame-Options, nosniff, Referrer-Policy. |
| **Audit log admin** | ✅ Resolvido | Toda ação admin sensível é logada em `admin_audit_logs`. |
| **LGPD — dados de saúde** | 🟡 Médio | `message_logs.content` é texto puro. Retenção de 90 dias. Sem criptografia em repouso. |
| **Segredos no transcript** | 🟡 Médio | DEPLOY.md menciona que secrets foram expostos em terminal durante auditoria. Recomendação: rotacionar. |
| **Múltiplos providers WhatsApp no código** | 🟢 Baixo | Código morto para 360dialog/Meta/Twilio. Z-API é o único usado. |

---

## 14. RISCOS DE CUSTO

| Risco | Descrição |
|-------|-----------|
| **Neon free tier → pago** | Free tier (0.5GB) pode ser insuficiente. Launch plan: $19/mês. Escala com compute. |
| **Railway pricing** | Modelo por recurso (RAM, CPU). Se volume crescer, custo pode subir sem previsibilidade. |
| **Anthropic API** | Custo por token. Onboarding consome mais tokens. Escala linearmente com novos pacientes. |
| **Vercel Pro** | Se exceder limites do Hobby (banda, builds), precisa upgrade ($20/mês). |
| **Multi-plataforma** | Custo operacional de gerenciar 4+ provedores (Railway, Vercel, Neon, Z-API). Complexidade de billing. |
| **Sem limite de custo por paciente** | Modelo de R$149/ano por paciente vs custos variáveis de infra — margem pode ser comprimida. |

---

## 15. PONTOS DE MELHORIA

| Área | Observação |
|------|-----------|
| **Centralização de infra** | 4+ plataformas poderiam ser consolidadas em 1 VPS com Docker Compose + GitHub Actions |
| **docker-compose** | Não existe. Impede rodar stack completa localmente (API + Redis + Postgres) |
| **CI ativo** | GitHub Actions está documentado mas não ativo (arquivo precisa ser copiado para `.github/workflows/`) |
| **Testes de integração** | Só 27 testes unitários (phone helpers + privacy helpers). Zero testes de API ou fluxo. |
| **E2E** | Sem testes end-to-end (Playwright/Cypress). Fluxo crítico onboarding não tem cobertura automatizada. |
| **Monitoramento** | Só Sentry opcional + healthcheck básico. Sem dashboard de métricas, alertas, uptime. |
| **Backups** | Sem estratégia documentada de backup do Neon. Migrations são o único "backup" de schema. |
| **Logs** | Winston local. Sem agregação externa. Logs somem no redeploy do Railway. |
| **Ambiente staging** | Não existe. Todo teste é em produção ou local com serviços reais. |
| **Secrets management** | Tudo em env vars. Sem cofre (Vault, Infisical). |
| **Healthcheck do web** | Vercel não tem /health exposto. Sem monitoramento do frontend. |
| **Cache de saúde** | Já existe para DB (Redis 5min). Pode ser estendido para outras consultas. |
| **Documentação** | Boa (docs/ + RUNBOOK + RUNBOOK). Mas faltam diagramas de deploy. |

---

## 16. RECOMENDAÇÃO PRELIMINAR DE CENTRALIZAÇÃO

### O que pode ser centralizado (com segurança)

| Componente | Migrar para | Viabilidade | Risco |
|-----------|------------|-------------|-------|
| API Express | VPS Docker | ✅ Alta — Dockerfile pronto | Baixo |
| Workers BullMQ | Mesma VPS (containers separados) | ✅ Alta | Baixo |
| Next.js frontend | Mesma VPS (Caddy/Nginx reverse proxy) | ✅ Alta | Baixo |
| Redis | Container na VPS | ✅ Alta | Baixo |
| PostgreSQL | Container na VPS com volumes | ⚠️ Média | Médio (backup, saúde) |
| CI/CD | GitHub Actions | ✅ Alta (já documentado) | Nenhum |

### O que NÃO pode ser removido (essencial ao negócio)

| Componente | Por que manter |
|-----------|---------------|
| Z-API | WhatsApp é o canal. Não há self-hosted equivalente prático. |
| Stripe | Gateway de pagamento regulado. Self-hosted inviável. |
| Anthropic Claude | Qualidade de conversa. Open-source (Ollama) exigiria GPU e ainda seria inferior. |

### Custo estimado de centralização
- **1 VPS** (4GB RAM, 2 vCPU, 80GB SSD): ~$20-24/mês (Hetzner, DigitalOcean)
- **Backup S3-compatible**: ~$2-5/mês
- **Domínio + DNS**: ~$10/ano
- **Total estimado**: ~$25/mês (vs ~$40-60/mês atual com Railway+Vercel+Neon)

---

## OBSERVAÇÕES FINAIS DA FASE 1

1. **Nenhum arquivo foi alterado.** Esta auditoria é estritamente em modo leitura.
2. **Nenhum segredo foi exposto.** Valores de `.env.example` são placeholders; credenciais reais não foram lidas.
3. **Há um sub-repositório `lembrymed-fix-media/`** com seu próprio `.git` — parece ser uma cópia de trabalho separada ou backup.
4. **Há arquivos grandes soltos na raiz** (imagens PNG, SVG, `files.zip`, `LEMBRYMED_MASTER_PROMPT_v1.md` 932 linhas). Recomendação anterior: mover para `assets/` ou `.github/assets/`.
5. **O CI-SUGGESTED.yml** contém placeholders com valores reais parciais — atenção ao copiar.
6. **A documentação é de alta qualidade** para o estágio do produto, especialmente `RUNBOOK.md` e `ARQUITETURA.md`.

---

**Próximo passo:** Gerar MATRIZ_CENTRALIZACAO_CUSTOS.md (Fase 2).
