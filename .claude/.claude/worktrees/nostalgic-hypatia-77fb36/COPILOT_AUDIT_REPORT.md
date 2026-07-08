# LEMBRYMED — Relatório Técnico Completo para Auditoria
**Data:** 22/04/2026  
**Repositório de Deploy:** `MarcusCarvalho1322/LEMBRYMEDV2`  
**API de Produção:** `https://lembrymed-api-production.up.railway.app`  
**Status atual do deploy Vercel:** ❌ FALHA (build quebrado — causa raiz identificada abaixo)

---

## 1. VISÃO GERAL DO PROJETO

O **Lembrymed** é uma plataforma SaaS de aderência medicamentosa para clínicas médicas. O produto:

- Envia lembretes de medicamentos via **WhatsApp** (Z-API) com horários configurados por paciente
- Registra **confirmações** de tomada de medicamento via resposta no WhatsApp
- Caso não confirmado em X horas, **alerta o familiar** cadastrado
- Processa **assinaturas** via Stripe (R$ 149/mês por paciente)
- Após pagamento, um **agente Claude** conduz o onboarding via WhatsApp e coleta: nome, medicamentos, horários, contato familiar
- Painel admin BIZZ.IA para gestão de pacientes, receita, renovações e fila de envios

### Stack
| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, React |
| Backend API | Express.js + TypeScript, Railway |
| Banco de dados | Neon PostgreSQL (Serverless) + Drizzle ORM |
| Filas | BullMQ + Redis (upstash via ioredis) |
| IA | Anthropic Claude 3.5 Sonnet (messages.create direto) |
| WhatsApp | Z-API (webhook + envio) |
| Pagamentos | Stripe (Checkout + Webhooks) |
| Deploy Frontend | Vercel (LEMBRYMEDV2 repo) |
| Deploy API | Railway |

---

## 2. ESTRUTURA DO REPOSITÓRIO LEMBRYMEDV2

```
LEMBRYMEDV2/                  ← raiz = Next.js app (Vercel faz build aqui)
├── app/                      ← App Router — páginas públicas + admin
│   ├── layout.tsx            ← Layout global
│   ├── page.tsx              ← Landing page pública
│   ├── success/page.tsx      ← Página pós-pagamento Stripe
│   └── admin/                ← Painel administrativo (protegido por JWT)
│       ├── layout.tsx        ← Login + Sidebar BIZZ.IA Design System
│       ├── page.tsx          ← Dashboard com KPIs, gauges SVG, mini chart
│       ├── patients/page.tsx ← Lista de pacientes + busca + adesão
│       ├── patient/[phone]/page.tsx ← Detalhe do paciente + edição
│       ├── revenue/page.tsx  ← Receita MRR/ARR, gráfico mensal
│       ├── renewals/page.tsx ← Assinaturas vencendo + botão lembrete
│       └── queue/page.tsx    ← Status da fila BullMQ + workers
├── apps/
│   ├── api/src/              ← ⚠️ FONTE DO BUG — arquivos .ts da API Express
│   │   └── routes/health.ts  ← import { Router } from 'express'
│   └── web/                  ← ⚠️ PASTA VAZIA (não usada — web está na raiz)
├── components/               ← Componentes React compartilhados
├── lib/
│   ├── api.ts                ← Cliente HTTP do frontend (fetch wrapper)
│   └── auth-context.tsx      ← AuthContext + useAuth hook (JWT via localStorage)
├── public/                   ← Assets estáticos (logo, imagens)
├── next.config.js            ← ⚠️ BUG: API_URL sem fallback
├── package.json              ← Deps do Next.js (next, react, stripe)
├── tsconfig.json             ← ⚠️ BUG PRINCIPAL: include "**/*.ts" pega apps/api
└── vercel.json               ← ⚠️ DEVE SER REMOVIDO (foi adicionado por engano)
```

---

## 3. CAUSA RAIZ DO BUILD QUEBRADO NO VERCEL

### Diagnóstico Completo

O Vercel clona o repo LEMBRYMEDV2 na raiz (`/vercel/path0/`). O `package.json` raiz é o do Next.js (`@lembrymed/web`). O `tsconfig.json` raiz tem:

```json
{
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

O glob `**/*.ts` aplicado da raiz do projeto captura **TODOS** os arquivos TypeScript do repositório, incluindo `apps/api/src/**/*.ts` — que são arquivos da API Express. Esses arquivos importam `express`, `bullmq`, `ioredis`, `@anthropic-ai/sdk`, etc. Nenhum desses pacotes está no `package.json` raiz (que é o package do Next.js). O TypeScript falha na fase de type-checking do `next build`:

```
./apps/api/src/routes/health.ts:1:24
Type error: Cannot find module 'express' or its corresponding type declarations.
```

### Histórico de Tentativas de Fix (todas falharam por diagnóstico errado)

| Commit | Tentativa | Resultado |
|--------|-----------|-----------|
| `fa7d537` | Rebuild completo do admin BIZZ.IA | ❌ TypeScript error (causa raiz não identificada ainda) |
| `8b0cf8e` | Fix `next.config.js` fallback API_URL | ❌ Mesmo erro TypeScript |
| `9d8f491` | Exclude `../api` no `apps/web/tsconfig.json` | ❌ Errou o arquivo — o tsconfig que importa é o da raiz |
| `ab267b3` | `vercel.json` com `installCommand: "npm install --prefix apps/web"` | ❌ Errou novamente — `apps/web` está vazia no LEMBRYMEDV2 |

### A Solução Correta (a ser implementada pelo Copilot)

São **3 mudanças** no repositório LEMBRYMEDV2:

---

#### FIX 1 — `tsconfig.json` (CRÍTICO)
**Arquivo:** `/tsconfig.json` (raiz do repo)

**Atual (quebrado):**
```json
{
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

**Correto:**
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "apps/api", "apps/api/**/*"]
}
```

**Por quê:** `apps/api/` contém arquivos Express que importam pacotes não presentes no `package.json` do Next.js. Excluí-los do TypeScript compilation resolve o erro imediatamente.

---

#### FIX 2 — `next.config.js` (IMPORTANTE)
**Arquivo:** `/next.config.js` (raiz do repo)

**Atual (quebrado):**
```js
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${process.env.API_URL}/:path*` },
    ];
  },
};
```

**Correto:**
```js
/** @type {import('next').NextConfig} */
const API_URL =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://lembrymed-api-production.up.railway.app';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
    ];
  },
};

module.exports = nextConfig;
```

**Por quê:** Se `API_URL` não estiver configurada como variável de ambiente no Vercel em tempo de build, o rewrite destination fica `"undefined/:path*"` e o Next.js rejeita a configuração. O fallback hardcoded garante funcionamento mesmo sem a env var.

**Verificar no Vercel:** Settings → Environment Variables → adicionar `API_URL = https://lembrymed-api-production.up.railway.app` para evitar dependência do fallback.

---

#### FIX 3 — Remover `vercel.json` (LIMPEZA)
**Arquivo:** `/vercel.json` (raiz do repo)

**Ação:** Deletar completamente. Foi adicionado por engano durante a tentativa de diagnóstico. Ele quebra o processo de install do Vercel ao tentar instalar um diretório `apps/web` que não existe como package independente neste repo.

---

## 4. O QUE FOI CONSTRUÍDO — ADMIN PANEL BIZZ.IA DESIGN SYSTEM

O painel administrativo foi completamente reconstruído com o BIZZ.IA Design System Premium. Todos os arquivos estão em `app/admin/`.

### Design System Aplicado

```
Paleta:
  Background:   #000000, #0A0A0A, #111111
  Copper:       #B87333 (accent primário)
  Gold:         #D4A853 (valores, KPIs)
  Texto:        #F0EDE8 (primário), #998E82 (secundário), #5A5248 (terciário)
  Sucesso:      #5BB85B
  Alerta:       #D4A853
  Erro/Urgente: #C0392B

Tipografia:
  Títulos:  'Cinzel', serif (letter-spacing: 3-6px, caps)
  Corpo:    'Cormorant Garamond', serif (italic para labels, 14-16px)
  Números:  'Cinzel', serif (bold, peso 700-900)
  Mono:     monospace (telefones, hashes)

Cards:
  background: #0A0A0A
  border: 1px solid rgba(255,255,255,.04)
  borderRadius: 14px
  hover: borderColor → rgba(184,115,51,.25), transform: translateY(-2px)
```

### Páginas Implementadas

#### `app/admin/layout.tsx` — Login + Sidebar
- Tela de login com glow radial copper, card escuro, inputs com focus copper
- Sidebar lateral com barra copper no item ativo, navegação 5 itens
- AuthContext.Provider wrappando toda a aplicação admin
- Logout com limpeza de localStorage

#### `app/admin/page.tsx` — Dashboard
- Relógio em tempo real (atualiza a cada 1s via setInterval)
- Auto-refresh dos dados a cada 30s
- 4 KPI cards: Assinantes Ativos, MRR, Lembretes Enviados Hoje, Taxa de Confirmação
- Gauges circulares SVG animados (stroke-dasharray transition)
- Mini bar chart SVG com 7 barras (novos assinantes por dia)
- Tabela de Status Operacional (API, WhatsApp, Stripe, Scheduler, Workers)
- Skeleton loading state enquanto dados carregam

#### `app/admin/patients/page.tsx` — Lista de Pacientes
- Busca com debounce 300ms (useRef timeout para evitar re-render excessivo)
- Paginação (página atual + total)
- Barra de adesão colorida: verde (≥80%), amarelo (≥50%), vermelho (<50%)
- Badge de status: ATIVO / INATIVO / PENDENTE com dot colorido
- Row hover effect via CSS class `.patient-row`

#### `app/admin/patient/[phone]/page.tsx` — Detalhe do Paciente
- Gauge SVG grande (160px) mostrando aderência 7 dias (%)
- Grid de InfoCards: Status, Assinatura, Familiar, Medicamentos
- Chips de medicamentos com borda copper
- Stats de confirmação: Confirmados / Negados / Sem resposta
- Tabela de histórico 7 dias com ícone ✓/✗/—
- Modal inline de edição (PATCH /admin/patients/:id) — nome, telefone familiar, status

#### `app/admin/revenue/page.tsx` — Receita
- KPIs: MRR, ARR, Ticket Médio com barra lateral copper
- Gráfico de barras horizontal (SVG nativo, gradiente copper→gold, animação CSS width)
- Tabela detalhada mensal: Mês / Assinaturas / Receita Bruta / Ticket Médio

#### `app/admin/renewals/page.tsx` — Renovações
- Filtro automático: Urgente (≤3 dias), Atenção (4-15 dias), Normal (16-30 dias)
- Contadores com cores semânticas no topo
- UrgencyBadge component: número de dias + label URGENTE/ATENÇÃO/NORMAL
- Botão "LEMBRETE" dispara POST /admin/renewals/:subId/remind
- Feedback inline: "✓ Enviado" ou "✗ Erro" após chamada

#### `app/admin/queue/page.tsx` — Fila de Envios
- Auto-refresh a cada 5s (setInterval)
- 4 QueueStat cards: Aguardando / Em Progresso / Concluídas / Com Falha
- 5 WorkerStatus: Reminder Scheduler, Reminder Sender, Family Alerter, Onboarding Nudge, Lifecycle Worker
- Dot indicator pulsante verde/vermelho por worker
- Métricas de hoje: lembretes enviados, confirmações, alertas, taxas de entrega/confirmação

---

## 5. ESTADO ATUAL DA API (Railway)

A API está **saudável e em produção** no Railway.

**Endpoint:** `https://lembrymed-api-production.up.railway.app`  
**Versão:** v2.9-hardening  
**Health check:** `GET /health` retorna 200 OK

### Rotas Confirmadas Funcionando
```
GET  /health                              → 200 OK
POST /webhook/stripe                      → Recebe eventos Stripe, cria assinatura, dispara onboarding WhatsApp
POST /webhook/whatsapp                    → Recebe mensagens Z-API, processa confirmações/negações, onboarding Claude
GET  /admin/dashboard                     → KPIs: activePatients, mrr, arr, sentToday, etc.
GET  /admin/dashboard/revenue             → Receita mensal últimos 6 meses
GET  /admin/patients                      → Lista paginada com search
GET  /admin/patients/:phone               → Detalhe + histórico 7 dias
PATCH /admin/patients/:id                 → Edição de paciente (nome, familiar, status)
GET  /admin/renewals                      → Assinaturas vencendo em 30 dias
POST /admin/renewals/:subId/remind        → Envio manual de lembrete
GET  /admin/queue                         → Status BullMQ + workers
```

### Variáveis de Ambiente Configuradas no Railway
```
DATABASE_URL          → Neon PostgreSQL connection string
REDIS_URL             → Upstash Redis connection string
ANTHROPIC_API_KEY     → Claude API key
STRIPE_SECRET_KEY     → Stripe secret
STRIPE_WEBHOOK_SECRET → Stripe webhook signing secret
ZAPI_INSTANCE_ID      → Z-API instance
ZAPI_TOKEN            → Z-API token
ZAPI_CLOUD_API_KEY    → Z-API Cloud API key
JWT_SECRET            → Para tokens admin
ADMIN_EMAIL           → Email do admin
ADMIN_PASSWORD_HASH   → bcrypt hash da senha
```

### Variáveis Pendentes no Vercel
```
API_URL               → https://lembrymed-api-production.up.railway.app  (NECESSÁRIO)
NEXT_PUBLIC_STRIPE_KEY → pk_live_... ou pk_test_...  (NECESSÁRIO para checkout)
```

---

## 6. FLUXO COMPLETO DO PRODUTO (ponta a ponta)

```
1. PACIENTE acessa landing page → clica "Assinar" (R$ 149/mês)
   └─ POST /api/checkout → Stripe Checkout Session criada
   
2. STRIPE processa pagamento → Webhook `checkout.session.completed`
   └─ POST /webhook/stripe
      ├─ Cria assinatura no banco (tabela subscriptions)
      ├─ Cria/atualiza paciente (tabela patients)
      └─ Envia mensagem WhatsApp de boas-vindas + onboarding

3. ONBOARDING via WhatsApp (Claude como agente)
   └─ POST /webhook/whatsapp (Z-API envia mensagens do paciente)
      ├─ Claude conduz conversa estruturada:
      │   1. Coleta nome completo
      │   2. Coleta medicamentos (nome + horário para cada um)
      │   3. Coleta telefone do familiar
      │   4. Confirma e salva no banco
      └─ Scheduler ativado após conclusão

4. LEMBRETES DIÁRIOS (BullMQ)
   ├─ ReminderScheduler: agenda jobs para cada horário de medicamento
   ├─ ReminderSender: envia WhatsApp no horário programado
   └─ Aguarda confirmação (4h)

5. RESPOSTA DO PACIENTE via WhatsApp
   └─ POST /webhook/whatsapp
      ├─ SIM/Confirmação → registra como confirmado
      ├─ NÃO/Negação → registra como negado
      └─ Sem resposta em 4h → FamilyAlerter envia alerta ao familiar

6. ADMIN monitora via painel
   └─ Dashboard, Pacientes, Receita, Renovações, Fila
```

---

## 7. BUGS CONHECIDOS E PENDÊNCIAS

### Bugs Ativos

| # | Arquivo | Bug | Prioridade |
|---|---------|-----|-----------|
| B1 | `tsconfig.json` (raiz LEMBRYMEDV2) | `include: ["**/*.ts"]` captura `apps/api/src` → build quebrado | 🔴 CRÍTICO |
| B2 | `next.config.js` (raiz LEMBRYMEDV2) | `API_URL` sem fallback → rewrite inválido se env var ausente | 🔴 CRÍTICO |
| B3 | `vercel.json` (raiz LEMBRYMEDV2) | Arquivo indevido que quebra o install command do Vercel | 🔴 CRÍTICO |

### Melhorias Pendentes

| # | Onde | O que fazer | Observação |
|---|------|-------------|-----------|
| M1 | `app/admin/page.tsx` | Dashboard usa `/admin/dashboard` — verificar se campos `sentToday`, `confirmedToday` existem na resposta real | Estrutura de dados pode divergir |
| M2 | `app/admin/queue/page.tsx` | Workers mostram `data.workers?.scheduler ?? true` — fallback `true` pode mascarar workers offline | Ajustar para mostrar undefined/loading até dado real chegar |
| M3 | `app/admin/patient/[phone]/page.tsx` | Edição de paciente usa `PATCH /admin/patients/:id` — confirmar que a API aceita campo `familiar_phone` |  |
| M4 | Variáveis Vercel | `NEXT_PUBLIC_STRIPE_KEY` e `API_URL` precisam ser configuradas no painel Vercel | Sem isso o checkout não funciona em produção |

---

## 8. ARQUIVOS MODIFICADOS NESTA SESSÃO DE DESENVOLVIMENTO

### No repositório LEMBRYMEDV2 (GitHub)

| Arquivo | Status | Descrição da mudança |
|---------|--------|---------------------|
| `app/globals.css` | ✅ Modificado | BIZZ.IA Design System: variáveis CSS, Google Fonts (Cinzel + Cormorant Garamond), skeleton, scrollbar copper |
| `app/admin/layout.tsx` | ✅ Modificado | Login premium + Sidebar BIZZ.IA completa |
| `app/admin/page.tsx` | ✅ Modificado | Dashboard com gauges SVG, relógio, mini chart, auto-refresh |
| `app/admin/patients/page.tsx` | ✅ Modificado | Tabela com busca, paginação, barra de adesão |
| `app/admin/patient/[phone]/page.tsx` | ✅ Modificado | Detalhe completo, gauge, edição modal |
| `app/admin/revenue/page.tsx` | ✅ Modificado | KPIs + gráfico barras + tabela mensal |
| `app/admin/renewals/page.tsx` | ✅ Modificado | UrgencyBadge + botão lembrete |
| `app/admin/queue/page.tsx` | ✅ Modificado | Workers + auto-refresh 5s |
| `next.config.js` | ✅ Modificado (mas precisa revisar) | Fallback para API_URL adicionado em branch local — verificar se está no LEMBRYMEDV2 |
| `tsconfig.json` | ❌ PRECISA CORRIGIR | Adicionar `"apps/api"` ao `exclude` |
| `vercel.json` | ❌ PRECISA DELETAR | Arquivo indevido criado por engano |

---

## 9. CHECKLIST PARA O COPILOT

### Ações Imediatas (desbloqueiam o deploy)

```
[ ] 1. tsconfig.json → adicionar "apps/api" e "apps/api/**/*" ao exclude
[ ] 2. next.config.js → adicionar fallback const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://lembrymed-api-production.up.railway.app'
[ ] 3. vercel.json → DELETAR o arquivo
[ ] 4. Verificar no Vercel Dashboard: Settings → Environment Variables → adicionar API_URL
```

### Validação Pós-Deploy

```
[ ] 5. Build Vercel passa sem erros (estado READY)
[ ] 6. Acessar /admin → tela de login exibida corretamente
[ ] 7. Login com admin@lembrymed.com → redireciona para dashboard
[ ] 8. Dashboard exibe KPIs (mesmo que zerados) sem erros de console
[ ] 9. Página de Pacientes lista pacientes da API
[ ] 10. Detalhe de paciente (/admin/patient/[phone]) carrega gauge e histórico
[ ] 11. Receita exibe gráfico mensal
[ ] 12. Renovações exibe assinaturas por urgência
[ ] 13. Fila exibe status dos workers
```

### Teste End-to-End (compra real)

```
[ ] 14. Acessar landing page → clicar Assinar → checkout Stripe (usar cartão teste: 4242 4242 4242 4242)
[ ] 15. Após pagamento → redirect para /success com mensagem de confirmação
[ ] 16. WhatsApp do número cadastrado recebe mensagem de boas-vindas em ≤30s
[ ] 17. Responder ao Claude → conduz onboarding completo
[ ] 18. Novo paciente aparece no admin /admin/patients
[ ] 19. No horário agendado → paciente recebe lembrete de medicamento via WhatsApp
[ ] 20. Responder SIM → confirmação registrada (verificar no detalhe do paciente)
```

---

## 10. CONTEXTO ADICIONAL PARA O COPILOT

### Por que há arquivos Express dentro do repo Next.js?

O repo `LEMBRYMEDV2` parece ter sido criado copiando seletivamente código do monorepo original (que tem `apps/api/` e `apps/web/` separados). Na cópia, o código da API Express em `apps/api/src/` foi incluído por acidente, mas sem o `package.json` da API (logo, sem `express` instalado). O TypeScript da raiz vê esses arquivos e falha.

**Decisão do Copilot:** Pode ou (a) simplesmente excluir `apps/api/` do TypeScript via tsconfig como descrito no Fix 1, deixando os arquivos no repo como referência, ou (b) deletar completamente o diretório `apps/` do LEMBRYMEDV2 já que não é necessário — a API roda no Railway com seu próprio repo/configuração.

**Recomendação:** Opção (b) — deletar `apps/` do LEMBRYMEDV2 é mais limpo. A API tem seu próprio pipeline de deploy via Railway e não pertence ao repo do frontend.

### Autenticação Admin

- Rota: `POST /api/auth/admin-login` (proxied via Next.js rewrites para a API)
- Retorna JWT token
- Token armazenado em `localStorage` como `lembrymed_token`
- `AuthContext` em `lib/auth-context.tsx` expõe `{ token, logout }`
- Todas as chamadas admin usam `api(path, { token })` de `lib/api.ts`

### Stripe Webhook Configurado

O webhook do Stripe deve apontar para: `https://[dominio-vercel]/api/webhook/stripe`

Eventos relevantes registrados:
- `checkout.session.completed` — cria assinatura + dispara onboarding

### Z-API Webhook Configurado

O webhook do Z-API deve apontar para: `https://lembrymed-api-production.up.railway.app/webhook/whatsapp`

---

## 11. COMMITS DE REFERÊNCIA

| SHA | Mensagem | Resultado |
|-----|----------|-----------|
| `d22168d` | fix: corrige URL de redirect pós-pagamento Stripe | ✅ ÚLTIMO DEPLOY BEM-SUCEDIDO |
| `fa7d537` | feat(admin): BIZZ.IA Design System rebuild completo | ❌ Build quebrado (TypeScript) |
| `8b0cf8e` | fix(web): next.config.js fallback API_URL | ❌ Build quebrado (mesmo erro) |
| `9d8f491` | fix: exclude apps/api do tsconfig | ❌ Errou o arquivo alvo |
| `ab267b3` | fix(vercel): vercel.json isolate web build | ❌ Quebrou o install (apps/web inexistente) |
| **pendente** | **fix: tsconfig exclude + remove vercel.json + next.config fallback** | **→ DEVE FUNCIONAR** |

---

*Relatório gerado em 22/04/2026 após sessão de diagnóstico e desenvolvimento.*  
*Autor: Marcus Cardoso Carvalho + Claude (BIZZ.IA Consulting)*
