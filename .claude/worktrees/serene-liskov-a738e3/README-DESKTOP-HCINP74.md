# Lembrymed

**Lembretes inteligentes de medicação via WhatsApp.**

Serviço brasileiro de SaaS healthtech que envia lembretes de medicação via WhatsApp e alerta um familiar cadastrado quando o paciente não confirma a tomada.

Operado por [BIZZ.IA Intelligence Ecosystem](https://bizzia.com.br) · Sinop/MT · 2026.

> 📖 Documentação completa em [`docs/`](docs/) · Política de Privacidade em [`/privacidade`](https://lembrymed.com.br/privacidade).

---

## Stack (abril/2026)

| Camada                        | Tecnologia                                                  |
|-------------------------------|-------------------------------------------------------------|
| Frontend/Landing              | Next.js 14 (App Router) em Vercel                           |
| Backend / API / Workers       | Express + BullMQ + node-cron em Railway                     |
| Banco                         | Neon PostgreSQL serverless + Drizzle ORM                    |
| Fila                          | Redis (Railway) via BullMQ                                  |
| WhatsApp Business             | Z-API (com fallback interno para 360dialog/Meta/Twilio)     |
| IA — conversação              | Anthropic Claude Sonnet 4.6 (`messages.create` direto)      |
| IA — extração estruturada     | Anthropic Claude Haiku 4.5                                  |
| Pagamentos                    | Stripe Checkout                                             |
| Monorepo                      | npm workspaces + Turborepo 2.0                              |
| Observabilidade               | Winston + Sentry (opcional via `SENTRY_DSN`)                |
| Testes                        | Vitest 1.6                                                  |

---

## Estrutura do monorepo

```
lembrymed/
├── apps/
│   ├── api/                  ← Express + BullMQ (deploy Railway)
│   │   ├── src/
│   │   │   ├── index.ts      ← bootstrap + workers
│   │   │   ├── config/       ← env validation, sentry, redis, queues
│   │   │   ├── middleware/   ← auth, rateLimit, securityHeaders, auditLog
│   │   │   ├── routes/
│   │   │   │   ├── admin/    ← /admin/* (JWT protected)
│   │   │   │   └── webhooks/ ← /webhook/stripe, /webhook/whatsapp
│   │   │   ├── workers/      ← BullMQ + cron
│   │   │   ├── services/     ← stripe.service
│   │   │   ├── clients/      ← WhatsApp (Z-API/...)
│   │   │   └── lib/          ← funções puras testáveis (phone, etc.)
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                  ← Next.js 14 (deploy Vercel)
│       ├── app/              ← landing, checkout, success, admin, privacidade, termos
│       ├── components/
│       └── lib/
├── packages/
│   ├── database/             ← Drizzle schema + migrations
│   └── shared/               ← types, logger, privacy helpers
├── .github/workflows/ci.yml
├── AUDIT/                    ← Relatórios da auditoria forense de 2026-04-22
├── docs/                     ← ARQUITETURA, FLUXOS, LGPD, RUNBOOK, ROADMAP
└── CHANGELOG.md
```

---

## Setup local

### 1. Clone e instale
```bash
git clone https://github.com/MarcusCarvalho1322/lembrymed.git
cd lembrymed
npm install
```

### 2. Configure variáveis de ambiente
```bash
cp .env.example .env
# Preencha conforme docs/SETUP-ENV.md
```

Variáveis **obrigatórias** em produção:
- `NODE_ENV=production`
- `DATABASE_URL` (Neon pooled)
- `REDIS_URL` (Railway)
- `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- `ZAPI_WEBHOOK_TOKEN` (configurar no painel Z-API também)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ANNUAL`
- `ANTHROPIC_API_KEY`
- `WEB_URL`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `NEXTAUTH_SECRET`

Opcionais:
- `SENTRY_DSN` (observabilidade)
- `ADMIN_WHATSAPP` (recebe alertas Z-API offline + LGPD requests)

### 3. Crie o schema no banco
```bash
npm run db:push
```

### 4. Rode em dev
```bash
# Em dois terminais OU um só:
npm run dev          # turbo dev (api + web)
npm run dev:api      # só API
npm run dev:web      # só landing/admin
```

### 5. Testes e checks
```bash
npm test                    # vitest (27 testes)
npm --workspace apps/api run typecheck
npm --workspace apps/web run typecheck
npm --workspace apps/web run build
```

---

## Deploy

### Vercel (landing + admin)
- Root directory: repo raiz (mesmo do monorepo)
- Build command: `cd apps/web && npm run build` (via `vercel.json`)
- Env: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ANNUAL`

### Railway (API + workers)
- Build: Dockerfile em `apps/api/Dockerfile`
- Healthcheck: `/health`
- Env: todas as obrigatórias acima

### Neon
- Aplicar migrations:
  1. Criar branch de preview
  2. `psql "$DATABASE_URL_UNPOOLED" -f packages/database/migrations/0001_*.sql`
  3. `psql "$DATABASE_URL_UNPOOLED" -f packages/database/migrations/0002_*.sql`
  4. Promover a branch

Veja [`docs/RUNBOOK.md`](docs/RUNBOOK.md) para procedimentos operacionais.

---

## Arquitetura resumida

```
Paciente (WhatsApp) ↔ Z-API ↔ [webhook /webhook/whatsapp Railway] ↔ Claude Sonnet/Haiku
                                              ↓
                                           Neon DB
                                              ↑
Cron 1/min (BullMQ) → Scheduler → fila → Sender → Z-API → Paciente
Delayed 30min (BullMQ) → Family Alerter → Z-API → Familiar

Admin browser ↔ Vercel Next.js ↔ JWT → Railway /admin/*
                                           ↓
                                         Neon DB
```

Diagramas detalhados em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Licença

Proprietário — BIZZ.IA Intelligence Ecosystem © 2026.
