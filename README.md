# Lembrymed

**Lembretes inteligentes de medicação via WhatsApp.**

Serviço brasileiro de SaaS healthtech que envia lembretes de medicação via WhatsApp e alerta um familiar cadastrado quando o paciente não confirma a tomada.

Operado por [BIZZ.IA Intelligence Ecosystem](https://bizzia.com.br) · Sinop/MT · 2026.

> 📖 Documentação completa em [`docs/`](docs/) · Política de Privacidade em [`/privacidade`](https://lembrymed.com.br/privacidade).

---

## Stack (julho/2026)

| Camada                        | Tecnologia                                                  |
|-------------------------------|-------------------------------------------------------------|
| Frontend/Landing              | Next.js 14 (App Router) em Docker (VPS)                     |
| Backend / API / Workers       | Express + BullMQ + node-cron em Docker (VPS)                |
| Banco                         | Neon PostgreSQL serverless + Drizzle ORM                    |
| Fila                          | Redis (container Docker) via BullMQ                         |
| WhatsApp Business             | Z-API (com fallback interno para 360dialog/Meta/Twilio)     |
| IA — conversação              | DeepSeek V3 (recomendado) + Anthropic Claude (fallback)     |
| Pagamentos                    | Stripe Checkout                                             |
| Monorepo                      | npm workspaces + Turborepo 2.0                              |
| CI/CD                         | GitHub Actions (typecheck + build + test + deploy SSH)      |
| Reverse Proxy                 | Caddy (SSL automático Let's Encrypt)                        |
| Observabilidade               | Winston + Sentry (opcional) + healthcheck scripts           |
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
# Preencha com suas chaves. Obrigatórias:
#   LLM_PROVIDER=deepseek
#   DEEPSEEK_API_KEY (https://platform.deepseek.com)
#   DATABASE_URL, DATABASE_URL_UNPOOLED (Neon)
#   ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN (Z-API)
#   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ANNUAL
#   ADMIN_EMAIL, ADMIN_PASSWORD_HASH, NEXTAUTH_SECRET
#   WEB_URL
# Veja .env.example para lista completa.
```

### 3. Crie o schema no banco
```bash
npm run db:push
```

### 4. Rode em dev (Docker — recomendado)
```bash
docker compose up -d        # API + Web + Redis + Postgres
docker compose logs -f api  # acompanhar logs
```

Ou sem Docker:
```bash
npm run dev          # turbo dev (api + web)
```

### 5. Deploy em produção
```bash
# Ver README_DEPLOY.md para guia completo
docker compose -f docker-compose.prod.yml up -d --build
```

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
