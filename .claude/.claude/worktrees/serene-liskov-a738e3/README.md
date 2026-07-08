# Lembrymed v2 — Arquitetura Híbrida

**Lembretes inteligentes de medicação via WhatsApp — 100% automatizado**

Powered by BIZZ.IA Intelligence Ecosystem

---

## Arquitetura

| Componente | Tecnologia | Função |
|-----------|-----------|--------|
| Onboarding | **Claude Managed Agents** (Sonnet 4.6) | Conversa inteligente de cadastro |
| Lembretes | **BullMQ + Redis** | CRON 1/min, envio determinístico |
| Alertas | **BullMQ** | Family alerter com delay 30min |
| Lifecycle | **node-cron** | Renovações e suspensões diárias |
| WhatsApp | **360dialog** | API oficial Meta — BSP |
| Extração IA | **Claude Haiku 4.5** | NLP/OCR de bulas e receitas |
| Pagamentos | **Stripe** | Checkout + renovação |
| Banco | **Neon PostgreSQL** | Serverless + Drizzle ORM |
| Backend | **Railway** | API + Workers |
| Frontend | **Vercel** | Dashboard + Landing |

---

## Setup

### 1. Clone e instale

```bash
git clone https://github.com/MarcusCarvalho1322/lembrymed.git
cd lembrymed
npm install
```

### 2. Configure o banco

```bash
cp .env.example .env
# Preencha DATABASE_URL e DATABASE_URL_UNPOOLED com Neon
npm run db:push
```

### 3. Configure o Managed Agent

```bash
# Preencha ANTHROPIC_API_KEY no .env
npx tsx scripts/setup-agents.ts
# Copie os IDs gerados para o .env
```

### 4. Configure as demais variáveis

- 360dialog: API key + phone number ID
- Stripe: secret key + webhook secret + price ID
- Redis: URL do Railway

### 5. Rode localmente

```bash
npm run dev:api
```

### 6. Deploy

```bash
# Railway (API + Workers)
railway up

# Vercel (Dashboard)
vercel --prod
```

---

## Estrutura

```
lembrymed/
├── scripts/setup-agents.ts           # Setup Managed Agents (1x)
├── packages/
│   ├── database/                     # Schema Drizzle + Neon
│   └── shared/                       # Types + Logger
├── apps/
│   ├── api/src/
│   │   ├── index.ts                  # Express server + boot
│   │   ├── routes/webhooks/
│   │   │   ├── stripe.ts             # → Managed Agent session
│   │   │   └── whatsapp.ts           # → Agent bridge OU confirm
│   │   ├── workers/
│   │   │   ├── reminder-scheduler    # BullMQ CRON 1/min
│   │   │   ├── reminder-sender       # BullMQ envio WhatsApp
│   │   │   ├── family-alerter        # BullMQ alerta familiar
│   │   │   └── lifecycle             # node-cron diário
│   │   ├── services/
│   │   │   ├── tool-executor         # Custom tools Managed Agent
│   │   │   ├── session-stream        # SSE processor
│   │   │   ├── ai.service            # Claude Haiku extração
│   │   │   └── stripe.service        # Payment links
│   │   ├── clients/dialog360         # 360dialog wrapper
│   │   └── prompts/                  # System prompt + tools
│   └── web/                          # Next.js (Vercel)
└── .env.example
```

---

## Licença

Proprietário — BIZZ.IA Intelligence Ecosystem © 2026
