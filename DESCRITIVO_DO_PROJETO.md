# LEMBRYMED — DESCRITIVO COMPLETO DO PROJETO
### Versão atualizada: Julho 2026 · Pós-Auditoria de Centralização

> Documento de leitura para o fundador e sócios.
> Cobre: o que é o produto, como funciona por dentro, o que mudou, quanto custa e o que falta para ir ao ar.

---

## PARTE 1 — O PRODUTO (O QUE O CLIENTE COMPRA)

### 1.1 O problema que resolvemos

A **não-adesão medicamentosa** é um dos maiores problemas de saúde pública do mundo:

| Dado | Fonte |
|------|-------|
| 50% dos pacientes crônicos não tomam remédios corretamente | OMS |
| 7 em cada 10 idosos abandonam ou erram o tratamento | Estudos de adesão |
| 80% dos casos de diabetes tipo 2 e doenças cardiovasculares seriam preveníveis com adesão | OMS |
| 24 milhões de diabéticos projetados no Brasil até 2050 | Ministério da Saúde |

**A dor do cliente não é técnica — é emocional:** o filho que mora em outra cidade, trabalha o dia inteiro, e só descobre que a mãe esqueceu o remédio quando ela passa mal. O Lembrymed vende **paz de espírito para a família** e **segurança para o paciente**.

### 1.2 A solução

O Lembrymed é um serviço de **lembretes inteligentes de medicação 100% via WhatsApp**:

- O paciente **não baixa aplicativo**, não cria senha, não aprende nada novo. Só recebe mensagens e responde "SIM" ou "NÃO".
- Três lembretes por dose: **10 minutos antes**, **na hora exata** e **10 minutos depois**.
- Se o paciente não confirmar em 30 minutos, **o familiar cadastrado é avisado automaticamente**.
- O cadastro inicial é feito por **conversa com Inteligência Artificial**: o paciente fala com o bot como se falasse com um atendente humano ("Tomo losartana 50mg de manhã e metformina no almoço").

### 1.3 Modelo de negócio

| Item | Valor |
|------|-------|
| Preço | **R$ 149/ano** por paciente |
| Período de teste | **15 dias grátis** (custo real por lead: ~R$ 2,09) |
| Cobrança | Stripe (cartão de crédito) |
| Canal de distribuição | Landing page + indicação de clínicas |
| Diferencial competitivo | **Nenhum player global usa WhatsApp como canal primário** |

---

## PARTE 2 — COMO O SISTEMA FUNCIONA POR DENTRO

### 2.1 A jornada completa do paciente

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐
│ 1. CHECKOUT │ →  │ 2. ONBOARDING│ →  │ 3. LEMBRETES │ →  │ 4. ALERTA   │
│ Landing page│    │ Bot pergunta │    │ 3 msg/dose   │    │ FAMILIAR    │
│ Paga R$ 149 │    │ remédios via │    │ via WhatsApp │    │ avisado se  │
│ (15d grátis)│    │ WhatsApp+IA  │    │ T-10/T0/T+10 │    │ não confirmar│
└─────────────┘    └──────────────┘    └──────────────┘    └─────────────┘
```

**Etapa 1 — Checkout**
O cliente preenche nome, email e WhatsApp na landing page. A página valida os dados (formato de telefone brasileiro, email válido) e exige o aceite da Política de Privacidade (exigência LGPD). O Stripe processa o pagamento. O consentimento é registrado no banco com IP, data e versão da política aceita.

**Etapa 2 — Onboarding conversacional**
Assim que o pagamento é confirmado (via webhook do Stripe), o sistema envia a primeira mensagem de boas-vindas no WhatsApp. Daí em diante, uma **IA (DeepSeek V3)** conduz a conversa:

- Pergunta quais remédios o paciente toma
- Pede dosagem e horários de cada um
- Pergunta se quer cadastrar um familiar para receber alertas
- Confirma tudo e ativa os lembretes

A IA responde em português natural, entende expressões como "de manhã", "depois do almoço", "antes de dormir", e converte tudo em horários exatos. Se o paciente mandar uma **foto da receita médica**, o sistema lê os medicamentos da imagem (recurso de visão da IA).

**Etapa 3 — Lembretes (o coração do sistema)**
A cada 60 segundos, um "relógio" interno verifica quais pacientes têm medicamento próximo do horário (sempre considerando o fuso de Brasília). Quando bate a janela, o sistema envia:

- **T-10:** "Lembrando: sua Losartana 50mg é às 08:00. Faltam 10 minutos ⏰"
- **T=0:** "Hora do seu remédio, Dona Maria! 💊"
- **T+10:** "Você tomou sua Losartana? Responda SIM ou NÃO"

**Etapa 4 — Confirmação e alerta familiar**
- Paciente responde **"SIM"** → registro de adesão salvo, sistema responde com mensagem positiva.
- Paciente responde **"NÃO"** → registro de recusa.
- Paciente **não responde em 30 minutos** → o familiar cadastrado recebe: "⚠️ Atenção! Sua mãe não confirmou que tomou Losartana às 08:00."

Regra de ouro: **no máximo 1 alerta por dia por familiar** (evita spam e bloqueio do número).

### 2.2 O que acontece nos bastidores (fluxos automáticos)

| Fluxo | Quando roda | O que faz |
|-------|------------|-----------|
| **Lifecycle diário** | Todo dia às 09:00 (Brasília) | Lembra renovações (faltam 30/15/3 dias), suspende assinaturas vencidas, faz check-in de pacientes sumidos há 3+ dias |
| **Retenção LGPD** | Diário | Anonimiza conversas com mais de 90 dias (exigência de minimização de dados) |
| **Relatório de adesão** | Dia 1º de cada mês | Envia resumo de adesão do paciente para o familiar |
| **Nudge de onboarding** | A cada 60 min | Se o paciente parou no meio do cadastro, envia mensagem gentil para reativar (máx. 2 por etapa) |
| **Monitor de saúde Z-API** | A cada 5 min | Verifica se o WhatsApp está conectado. Se cair, avisa o admin imediatamente |
| **Backup do banco** | Diário às 03:00 | Dump completo do banco, compactado, guardado 30 dias |

### 2.3 O painel administrativo

O fundador acessa `lembrymed.com.br/admin` com email e senha (token JWT de 24h):

- **Dashboard:** pacientes ativos, adesão geral, KPIs
- **Pacientes:** lista, busca por telefone, detalhe completo de cada paciente
- **Receita:** MRR/ARR, gráfico mensal
- **Renovações:** assinaturas vencendo, botão de reenvio de lembrete
- **Fila:** status dos envios (jobs na fila, falhas)

Toda ação do admin é registrada em **log de auditoria** (exigência LGPD Art. 46).

---

## PARTE 3 — A TECNOLOGIA (O QUE MUDOU NA AUDITORIA)

### 3.1 Stack completa

| Camada | Tecnologia | Observação |
|--------|-----------|------------|
| Linguagem | TypeScript 5.5 (strict) | Tipagem forte em todo o projeto |
| Backend | Express.js 4 + Node 20 | API + webhooks + workers no mesmo processo |
| Frontend | Next.js 15 (App Router) | Modo standalone (otimizado para Docker) |
| Banco de dados | **PostgreSQL 16 em container Docker** | Migrado do Neon (era serverless externo) |
| ORM | Drizzle ORM 0.45 | Schema em TypeScript, migrations em SQL |
| Driver BD | `pg` (node-postgres) | Conexões TCP persistentes, sem cold-start |
| Fila de jobs | BullMQ 5 + **Redis 7 em container** | 2 filas: send-reminder e family-alert |
| Agendamento | node-cron | Lifecycle, nudges, health checks |
| WhatsApp | **Z-API** (primário) | 360dialog/Meta/Twilio como fallback no código |
| IA conversacional | **DeepSeek V3** | Migrado do Anthropic Claude |
| IA fallback | Anthropic Claude | Mantido como plano B via variável de ambiente |
| Pagamentos | Stripe | Checkout + webhooks com idempotência |
| Autenticação | JWT + bcrypt | Rate limit no login (5 tentativas/15min) |
| Validação | Zod | Schema de todas as envs + bodies de API |
| Logs | Winston (JSON estruturado) | Rotação via Docker |
| Testes | Vitest | 300 testes unitários |
| Monorepo | npm workspaces + Turborepo | 2 apps + 2 packages |

### 3.2 As 4 grandes mudanças da auditoria

#### Mudança 1: Anthropic Claude → DeepSeek V3

**Antes:** o onboarding conversava via Claude Sonnet (US$ 3 por milhão de tokens).
**Depois:** conversa via DeepSeek V3 (US$ 1,10 por milhão de tokens).

- Economia de **~70%** no custo de IA
- Código ficou **provider-agnostic**: trocar de IA no futuro é mudar 1 variável
- Claude mantido como fallback de emergência
- Novo arquivo: `apps/api/src/lib/llm-provider.ts` (abstração multi-backend)

#### Mudança 2: Neon → PostgreSQL próprio

**Antes:** banco serverless na Neon (US$ 0-19/mês, cold-start de 100-400ms, risco de custo surpresa com escala).
**Depois:** PostgreSQL 16 em container Docker na própria VPS.

- Custo do banco: **R$ 0** (incluído na VPS)
- Zero latência de cold-start
- Sem lock-in de plataforma — os dados são 100% nossos
- Backup diário automático com retenção de 30 dias

#### Mudança 3: Railway + Vercel → VPS única com Docker

**Antes:** API no Railway (~US$ 25/mês), frontend no Vercel (US$ 0-20/mês), Redis no Railway.
**Depois:** tudo em **uma VPS** com Docker Compose:

```
VPS (Hetzner CX22, ~R$ 25/mês)
├── Caddy          → HTTPS automático (Let's Encrypt)
├── API Express    → container próprio
├── Next.js        → container próprio
├── PostgreSQL 16  → container próprio (dados em volume persistente)
└── Redis 7        → container próprio (filas + cache)
```

- Deploy automatizado via GitHub Actions (push na main → deploy)
- Rollback em 3 minutos (git revert + rebuild)
- Healthcheck automático a cada 30s + script de alerta no WhatsApp

#### Mudança 4: Zero CI → CI/CD completo

**Antes:** CI documentado mas nunca ativado.
**Depois:**

- **CI** (a cada push/PR): typecheck + build + 300 testes
- **CD** (push na main): SSH na VPS → git pull → rebuild → healthcheck
- **Rollback manual** via workflow dedicado

### 3.3 Estrutura de arquivos (o que está no GitHub)

```
lembrymedoficial/
├── apps/
│   ├── api/                          # Backend
│   │   ├── Dockerfile                # Multi-stage (build + runtime)
│   │   ├── package.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts              # Bootstrap Express + workers
│   │       ├── boot/                 # api-server, workers-runner (RUN_MODE)
│   │       ├── config/               # env (Zod), redis, queues, sentry
│   │       ├── middleware/           # auth JWT, rateLimit, auditLog, securityHeaders
│   │       ├── routes/
│   │       │   ├── webhooks/         # stripe, whatsapp (+ handlers LGPD, extração)
│   │       │   └── admin/            # dashboard, patients, renewals, queue
│   │       ├── workers/              # 8 workers (scheduler, sender, alerter...)
│   │       ├── clients/              # WhatsApp (Z-API + fallbacks)
│   │       ├── services/             # stripe.service
│   │       ├── lib/                  # llm-provider, brt, scheduling, phone, cache
│   │       └── __tests__/            # 12 arquivos de teste
│   │
│   └── web/                          # Frontend
│       ├── Dockerfile                # Next.js standalone
│       ├── next.config.js            # output: standalone + security headers + CSP
│       └── app/
│           ├── page.tsx              # Landing page
│           ├── checkout/             # Pagamento com consentimento LGPD
│           ├── success/              # Pós-pagamento
│           ├── privacidade/          # Política de privacidade
│           ├── termos/               # Termos de uso
│           └── admin/                # Painel (dashboard, pacientes, receita...)
│
├── packages/
│   ├── database/                     # Schema Drizzle + 6 migrations + scripts
│   │   ├── schema.ts                 # 13 tabelas + enums + relações
│   │   ├── index.ts                  # Pool pg + drizzle
│   │   ├── migrations/               # 0001 a 0006 (.sql)
│   │   ├── seed.ts                   # Popula system_config + hash admin
│   │   ├── apply-migration.ts        # Aplica .sql no banco
│   │   ├── check-schema.ts           # Inspeção de tabelas/FKs
│   │   └── wipe-patients.ts          # Reset de dados (dry-run + --yes)
│   │
│   └── shared/                       # logger (Winston), types, privacy helpers
│
├── scripts/
│   ├── backup.sh                     # pg_dump diário + retenção 30d
│   ├── restore.sh                    # Restore com confirmação
│   ├── deploy.sh                     # Deploy manual (fallback do CI/CD)
│   └── healthcheck.sh                # Verificação + alerta WhatsApp
│
├── .github/workflows/
│   ├── ci.yml                        # Typecheck + build + testes
│   └── deploy.yml                    # Deploy SSH + job de rollback
│
├── docker-compose.yml                # Dev local (4 containers)
├── docker-compose.prod.yml           # Produção (4 containers + volumes)
├── Caddyfile                         # Reverse proxy + SSL + headers
├── .env.example                      # Template de configuração (33 vars)
│
└── Documentação (12 arquivos)
    ├── README.md                     # Visão geral
    ├── README_DEPLOY.md              # Guia de deploy para não-dev
    ├── PLANO_LANCAMENTO_SOCIOS.md    # Apresentação para investidores
    ├── ANALISE_ZIP_E_PLANO_AO_AR.md  # Comparativo zip antigo vs novo
    ├── AUDITORIA_TECNICA_HERMES.md   # Auditoria completa (16 seções)
    ├── MATRIZ_CENTRALIZACAO_CUSTOS.md# 3 cenários de economia
    ├── ARQUITETURA_CENTRALIZADA_PROPOSTA.md # Diagramas Mermaid
    ├── PLANO_IMPLANTACAO_GITHUB.md   # Rotas de deploy
    ├── CHECKLIST_MIGRACAO_SEGURA.md  # 20 passos ordenados
    ├── PROPOSTA_ALTERACOES_CODIGO.md # O que foi alterado e por quê
    ├── HEALTHCHECK.md                # Monitoramento
    └── MIGRATIONS.md                 # Política de banco
```

---

## PARTE 4 — O BANCO DE DADOS (O QUE GUARDAMOS)

### 4.1 As 13 tabelas

| Tabela | Conteúdo | Classificação |
|--------|----------|---------------|
| `patients` | Nome, telefone, WhatsApp ID, etapa do onboarding, fuso | Core |
| `family_contacts` | Nome e telefone do familiar de cada paciente | Core |
| `subscriptions` | Status Stripe, datas, flags de lembrete de renovação | Core |
| `medications` | Nome, dosagem, horários (array), instruções | Core |
| `reminder_logs` | Cada lembrete enviado (tipo, horário, status) | Core |
| `medication_confirmations` | Cada SIM/NÃO do paciente | Core |
| `message_logs` | Todas as conversas do WhatsApp (com retenção de 90 dias) | Core |
| `family_alert_logs` | Alertas enviados a familiares (dedup diário) | Core |
| `system_config` | Configurações (preços, offsets, limites) | Sistema |
| `consent_logs` | Registro de cada aceite de privacidade (IP, data, versão) | LGPD |
| `privacy_policies` | Versões publicadas da política | LGPD |
| `lgpd_incidents` | Pedidos de exportação/exclusão de dados | LGPD |
| `admin_audit_logs` | Toda ação do admin no painel | LGPD |

### 4.2 Dados e privacidade (LGPD)

- **Consentimento explícito** no checkout, registrado com IP/versão/data
- **Direito do titular** pelo próprio WhatsApp: "EXCLUIR MEUS DADOS" ou "EXPORTAR MEUS DADOS"
- **Retenção:** conversas são anonimizadas após 90 dias
- **Auditoria:** todas as ações administrativas são logadas
- **Exclusão em cascata:** apagar um paciente apaga todos os dados vinculados, exceto o registro de consentimento (obrigatório por lei)

---

## PARTE 5 — SEGURANÇA (O QUE JÁ ESTÁ PROTEGIDO)

| Proteção | Implementação |
|----------|---------------|
| Token de webhook WhatsApp | Comparação em tempo constante (timingSafeEqual), obrigatório em produção |
| Webhook Stripe | Validação HMAC + idempotência via Redis (evento duplicado não processa 2x) |
| Login admin | Rate limit: 5 tentativas/15min por IP + email; bcrypt com comparação constante |
| JWT | Segredo obrigatório (mín. 32 chars), expiração 24h, tolerância de relógio |
| Headers | HSTS, X-Frame-Options, nosniff, Referrer-Policy, CSP restritiva |
| CORS | Whitelist explícita de origens |
| Fail-fast | App não sobe com configuração inválida (Zod no boot) |
| Anti prompt-injection | Marcadores de estado validados semanticamente |
| Docker | Containers rodam como usuário não-root |
| Backup | Diário, criptografável via S3 (opcional) |

**Ponto de atenção conhecido:** o token JWT do admin fica no `localStorage` do navegador (mitigado por CSP restritiva). A migração para cookie HttpOnly está planejada no roadmap.

---

## PARTE 6 — CUSTOS (QUANTO CUSTA RODAR)

### 6.1 Custo fixo mensal (produção)

| Item | Custo | Observação |
|------|-------|-----------|
| VPS Hetzner CX22 (2 vCPU, 4GB RAM, 40GB) | ~R$ 25 | Roda API + Web + PostgreSQL + Redis + Caddy |
| Z-API (WhatsApp) | ~R$ 49 | Instância oficial não-BSP |
| DeepSeek V3 (IA) | ~R$ 5-30 | Depende do volume de onboarding |
| Stripe | 2,99% + R$ 0,99 por transação | Só quando vende |
| Domínio .com.br | ~R$ 40/ano | Já existente |
| **TOTAL FIXO** | **~R$ 80-105/mês** | |

### 6.2 Comparativo com a arquitetura antiga

| Plataforma | Antes | Depois |
|-----------|-------|--------|
| Railway (API+Redis) | ~R$ 125 | **R$ 0** |
| Vercel (frontend) | US$ 0-20 | **R$ 0** |
| Neon (banco) | US$ 0-19 | **R$ 0** |
| Anthropic (IA) | ~US$ 5-30 | ~US$ 1-8 (DeepSeek) |
| **Economia total** | — | **~70%** |

### 6.3 Custo por cliente

| Métrica | Valor |
|---------|-------|
| Custo por lead nos 15 dias grátis | **R$ 2,09** |
| Custo de aquisição (conversão 30%) | ~R$ 7 |
| Receita anual por cliente | R$ 149 |
| Margem bruta por cliente/ano | ~R$ 140 (94%) |

---

## PARTE 7 — ESTADO ATUAL E O QUE FALTA PARA IR AO AR

### 7.1 Já está pronto ✅

- [x] Código completo (backend + frontend + banco)
- [x] Migração para DeepSeek V3
- [x] Migração para PostgreSQL próprio
- [x] Docker (dev + produção)
- [x] CI/CD no GitHub Actions
- [x] Scripts de backup/restore/monitoramento
- [x] 300 testes passando, typecheck limpo
- [x] Publicado no GitHub: `MarcusCarvalho1322/lembrymedoficial`
- [x] Documentação completa (12 documentos)

### 7.2 Falta fazer (para produção)

| # | Ação | Responsável | Tempo |
|---|------|-------------|-------|
| 1 | Contratar VPS (Hetzner CX22) | Marcus | 15 min |
| 2 | Criar conta DeepSeek e copiar API key | Marcus | 10 min |
| 3 | Criar/confirmar instância Z-API (WhatsApp) | Marcus | 20 min |
| 4 | Criar produto R$ 149 no Stripe + webhook | Marcus | 15 min |
| 5 | Configurar DNS: lembrymed.com.br → IP da VPS | Marcus | 10 min |
| 6 | Deploy completo na VPS (Docker + Caddy + .env) | Hermes | 2h |
| 7 | Smoke test completo (onboarding → lembrete → alerta → pagamento) | Hermes+Marcus | 1h |
| 8 | Lançamento com 15 dias grátis | Marcus | — |

### 7.3 Roadmap pós-lançamento

| Horizonte | Item |
|-----------|------|
| Imediato | Configurar `ADMIN_WHATSAPP` para alertas no seu WhatsApp |
| 30 dias | Canal de fallback se Z-API cair (email Resend, R$ 0 até 3k/mês) |
| 30-90 dias | JWT admin em cookie HttpOnly (mitigação total de XSS) |
| 3-6 meses | Portal do paciente (PWA leve) — só se houver demanda |
| 3-6 meses | Assinatura mensal recorrente (Stripe) |
| Quando >500 pacientes | Separar workers em container próprio |

---

## PARTE 8 — GLOSSÁRIO RÁPIDO (PARA LEITURA NÃO-TÉCNICA)

| Termo | O que significa |
|-------|----------------|
| **VPS** | Um computador alugado na nuvem que fica ligado 24h rodando o Lembrymed |
| **Docker** | Tecnologia que empacota o sistema em "caixas" isoladas que funcionam em qualquer servidor |
| **Container** | Uma dessas caixas (o Lembrymed usa 5: Caddy, API, Web, PostgreSQL, Redis) |
| **Webhook** | Aviso automático que um serviço externo (Stripe, WhatsApp) manda pro nosso sistema quando algo acontece |
| **BullMQ/Redis** | Sistema de fila de tarefas: garante que cada lembrete seja enviado na ordem certa, sem duplicar |
| **DeepSeek V3** | A inteligência artificial que conversa com o paciente no onboarding |
| **Z-API** | Serviço que conecta nosso sistema ao WhatsApp |
| **CI/CD** | Automação: testa o código e coloca no ar sozinho quando você faz upload |
| **Caddy** | Porteiro que cuida do HTTPS (cadeado de segurança do site) |
| **Drizzle ORM** | Camada que traduz TypeScript para comandos de banco de dados |
| **LGPD** | Lei Geral de Proteção de Dados — o Lembrymed está em conformidade |
| **Migration** | Arquivo que atualiza a estrutura do banco de dados de forma segura |

---

*Documento gerado pela auditoria Hermes. Versão 1.0 — Julho 2026.*
