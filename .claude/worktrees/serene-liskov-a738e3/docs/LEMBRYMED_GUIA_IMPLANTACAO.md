# ═══════════════════════════════════════════════════════════════
# LEMBRYMED v2 — GUIA DE IMPLANTAÇÃO PARA NÃO-DESENVOLVEDOR
# ═══════════════════════════════════════════════════════════════
#
# Marcus, este documento tem duas partes:
#
# PARTE 1: O que fazer ANTES de rodar o Claude Code
# PARTE 2: O prompt completo para colar no Claude Code
#
# ═══════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════
# PARTE 1 — PREPARAÇÃO (5-10 minutos no navegador)
# ═══════════════════════════════════════════════════════════════

# Você precisa criar contas/projetos em 4 serviços (todos gratuitos ou pay-as-you-go):
#
# 1. NEON (banco de dados)
#    → Acesse: https://neon.tech
#    → Crie um projeto chamado "lembrymed"
#    → Copie a "Connection String" (pooled) — algo como:
#      postgresql://neondb_owner:xxxx@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
#    → Copie também a "Unpooled" connection string (para migrations)
#
# 2. RAILWAY (backend + Redis)
#    → Acesse: https://railway.app
#    → Crie um projeto chamado "lembrymed"
#    → Dentro dele, adicione um serviço "Redis" (clique + New → Redis)
#    → Copie a REDIS_URL que o Railway gerar
#
# 3. STRIPE (pagamentos)
#    → Acesse: https://dashboard.stripe.com
#    → Vá em API Keys → copie Secret Key (sk_live_xxx ou sk_test_xxx)
#    → Vá em Products → crie um produto "Lembrymed Anual" com preço R$ 149,00
#    → Copie o Price ID (price_xxx)
#    → Vá em Webhooks → adicione endpoint (URL do Railway + /webhook/stripe)
#    → Copie o Webhook Signing Secret (whsec_xxx)
#
# 4. 360DIALOG (WhatsApp)
#    → Acesse: https://hub.360dialog.com
#    → Crie conta e configure um número WhatsApp Business
#    → Copie a API Key e o Phone Number ID
#
# 5. ANTHROPIC (IA)
#    → Acesse: https://console.anthropic.com
#    → Vá em API Keys → crie uma key
#    → Copie (sk-ant-xxx)
#
# ANOTE TUDO num bloco de notas. Você vai precisar de:
#
# DATABASE_URL=postgresql://...
# DATABASE_URL_UNPOOLED=postgresql://...
# REDIS_URL=redis://...
# STRIPE_SECRET_KEY=sk_...
# STRIPE_WEBHOOK_SECRET=whsec_...
# STRIPE_PRICE_ANNUAL=price_...
# DIALOG_API_KEY=...
# DIALOG_PHONE_NUMBER_ID=...
# DIALOG_WEBHOOK_SECRET=...
# ANTHROPIC_API_KEY=sk-ant-...


# ═══════════════════════════════════════════════════════════════
# PARTE 2 — PROMPT PARA O CLAUDE CODE
# ═══════════════════════════════════════════════════════════════
#
# Abra o Claude Code no terminal e cole este prompt completo:
#
# ───────────────────────────────────────────────────────────────

<<'PROMPT_CLAUDE_CODE'

Você é o CTO do projeto Lembrymed. Preciso que faça a implantação completa.
O código-fonte está pronto na pasta que vou indicar.

CONTEXTO:
- Sou não-desenvolvedor. Execute tudo autonomamente sem pedir confirmação.
- O projeto é um monorepo TypeScript (Turborepo) com:
  - apps/api/ → Express backend (Railway)
  - apps/web/ → Next.js frontend (Vercel)
  - packages/database/ → Drizzle ORM + Neon
  - packages/shared/ → Types + Logger
  - scripts/setup-agents.ts → Setup Managed Agents

CREDENCIAIS (substituir pelos valores reais):
DATABASE_URL=COLE_AQUI
DATABASE_URL_UNPOOLED=COLE_AQUI
REDIS_URL=COLE_AQUI
STRIPE_SECRET_KEY=COLE_AQUI
STRIPE_PUBLISHABLE_KEY=COLE_AQUI
STRIPE_WEBHOOK_SECRET=COLE_AQUI
STRIPE_PRICE_ANNUAL=COLE_AQUI
ANTHROPIC_API_KEY=COLE_AQUI
DIALOG_API_KEY=COLE_AQUI
DIALOG_PHONE_NUMBER_ID=COLE_AQUI
DIALOG_WEBHOOK_SECRET=COLE_AQUI
ADMIN_EMAIL=marcus@bizzia.com.br
ADMIN_PASSWORD=lembrymed-admin-2026

TAREFAS (executar em sequência, sem parar):

1. SETUP LOCAL
   - cd na pasta do projeto
   - npm install
   - Criar .env com todas as credenciais acima
   - Criar .env.local na apps/web com NEXT_PUBLIC_API_URL

2. BANCO DE DADOS
   - Rodar: npx drizzle-kit push (usando DATABASE_URL_UNPOOLED)
   - Rodar: npx tsx packages/database/seed.ts
   - Verificar que as tabelas foram criadas no Neon

3. MANAGED AGENTS
   - Rodar: npx tsx scripts/setup-agents.ts
   - Capturar os IDs gerados (MANAGED_AGENT_ENV_ID e ONBOARDING_AGENT_ID)
   - Adicionar ao .env

4. GIT
   - Verificar se existe repo: MarcusCarvalho1322/lembrymed no GitHub
   - Se existir: fazer git pull, substituir todo o conteúdo, commit e push
   - Se não existir: criar o repo, fazer push inicial
   - Branch: main

5. DEPLOY BACKEND (Railway)
   - Conectar o repo GitHub ao projeto Railway
   - Configurar TODAS as env vars no Railway
   - O Dockerfile será detectado automaticamente
   - Verificar que o deploy funciona acessando /health

6. DEPLOY FRONTEND (Vercel)
   - Conectar o repo ao Vercel
   - Root directory: apps/web
   - Framework: Next.js
   - Configurar env var: NEXT_PUBLIC_API_URL com a URL do Railway
   - Verificar que o deploy funciona

7. STRIPE WEBHOOK
   - Após ter a URL do Railway, configurar o webhook no Stripe:
   - URL: https://[railway-url]/webhook/stripe
   - Eventos: checkout.session.completed

8. 360DIALOG WEBHOOK
   - Configurar webhook no 360dialog Hub:
   - URL: https://[railway-url]/webhook/whatsapp

9. TESTE END-TO-END
   - Acessar a landing page na Vercel
   - Acessar /admin e fazer login com as credenciais
   - Verificar que o dashboard carrega

10. REPORTAR
    - Me dizer todas as URLs finais
    - Me dizer se algo falhou e como resolver

AUTONOMIA TOTAL. Não pare para perguntar. Execute tudo até o fim.

PROMPT_CLAUDE_CODE

# ───────────────────────────────────────────────────────────────
# FIM DO PROMPT
# ═══════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════
# ALTERNATIVA: USAR COWORK (se não tiver Claude Code)
# ═══════════════════════════════════════════════════════════════
#
# O Claude Cowork opera diretamente no seu computador.
# Ele abre o navegador, faz login nos serviços, configura tudo.
#
# Se preferir este caminho, abra o Cowork e cole:
#
# "Preciso implantar o projeto Lembrymed. O código está em
#  /pasta/do/projeto. Preciso que você:
#  1. Abra o GitHub e faça push do código
#  2. Abra o Neon e crie o banco
#  3. Abra o Railway e configure o backend + Redis
#  4. Abra a Vercel e configure o frontend
#  5. Abra o Stripe e crie o produto + webhook
#  6. Configure tudo e me reporte as URLs finais
#  Aqui estão as credenciais: [colar as credenciais]"
#
# ═══════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════
# APÓS A IMPLANTAÇÃO — VERIFICAÇÕES
# ═══════════════════════════════════════════════════════════════
#
# 1. Landing page: https://lembrymed.vercel.app (ou domínio custom)
# 2. Admin: https://lembrymed.vercel.app/admin
#    → Login: marcus@bizzia.com.br / lembrymed-admin-2026
# 3. API Health: https://[railway-url]/health
#    → Deve retornar: {"status":"ok","redis":"connected"}
# 4. Teste de pagamento: usar Stripe test mode
#    → Cartão teste: 4242 4242 4242 4242
# 5. Verificar que o onboarding WhatsApp iniciou após pagamento teste
#
# ═══════════════════════════════════════════════════════════════
