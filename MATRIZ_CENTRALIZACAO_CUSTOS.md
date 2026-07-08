# MATRIZ DE CENTRALIZAÇÃO E REDUÇÃO DE CUSTOS — LEMBRYMED

**Data:** 07/07/2026
**Referência:** AUDITORIA_TECNICA_HERMES.md
**Objetivo:** Comparar cada plataforma/serviço externo encontrado e traçar rota de centralização com 3 cenários.

---

## ANÁLISE INDIVIDUAL DE CADA SERVIÇO

### 1. Railway (API Express + Workers + Redis)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Railway (PaaS) |
| **Função no projeto** | Hospedar API Express, workers BullMQ, Redis, healthcheck |
| **É essencial?** | Sim, para a API e workers |
| **Pode ser removido?** | Sim, migrando para VPS com Docker Compose |
| **Pode ser substituído por self-hosted?** | ✅ Sim. Dockerfile já existe. docker-compose.yml bastaria. |
| **Pode rodar em Docker?** | ✅ Sim. Já roda (Dockerfile no deploy Railway) |
| **Risco de remoção** | Médio. Requer configurar VPS, domínio, SSL, backups. Mas Dockerfile está pronto. |
| **Esforço de migração** | 4-8 horas (criar compose, configurar Caddy/Nginx, testar) |
| **Economia potencial** | ~$20-25/mês → $0 (já incluso no custo da VPS) |
| **Recomendação** | Migrar para VPS Docker. É a plataforma mais cara e mais facilmente substituível. |

### 2. Vercel (Frontend Next.js)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Vercel (Hobby ou Pro) |
| **Função no projeto** | Hospedar landing page, admin UI, checkout, páginas legais |
| **É essencial?** | Sim, para o frontend |
| **Pode ser removido?** | Sim. Next.js tem `output: 'standalone'` e roda em qualquer Node. |
| **Pode ser substituído por self-hosted?** | ✅ Sim. Next.js standalone + Caddy/Nginx reverse proxy. |
| **Pode rodar em Docker?** | ✅ Sim. Pode compartilhar VPS com API ou container separado. |
| **Risco de remoção** | Baixo. Next.js build é padrão. ISR/SSG funciona com filesystem local. |
| **Esforço de migração** | 2-4 horas. Ajustar next.config.js (`output: 'standalone'`), criar Dockerfile web, configurar proxy reverso. |
| **Economia potencial** | $0-20/mês → $0 (incluso na VPS) |
| **Recomendação** | Migrar para mesma VPS da API (compartilha infra). Sem custo adicional. |

### 3. Neon (PostgreSQL Serverless)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Neon PostgreSQL Serverless |
| **Função no projeto** | Banco de dados principal (11 tabelas, relações, FKs, índices) |
| **É essencial?** | Sim. Sem banco, produto não funciona. |
| **Pode ser removido?** | Sim, migrando para PostgreSQL em container. |
| **Pode ser substituído por self-hosted?** | ✅ Sim. PostgreSQL oficial em Docker com volume persistente. |
| **Pode rodar em Docker?** | ✅ Sim. Imagem `postgres:16-alpine`. |
| **Risco de remoção** | **Alto.** Dados de saúde, backups críticos, sem cold-start, mas exige backup rigoroso. Neon tem branching (prévia de migrations) que self-hosted não tem. |
| **Esforço de migração** | 6-12 horas. pg_dump → pg_restore, testar FKs, índices, enums, validar driver Drizzle. |
| **Economia potencial** | $0-19/mês → $0 (incluso na VPS). Porém Neon Free (0.5GB) já é $0. |
| **Recomendação** | **Manter Neon no curto prazo.** Migrar para PostgreSQL container requer estratégia de backup robusta. Se o banco crescer >0.5GB, aí justifica a migração. Fato: Neon já está com consumo de CU-horas alto; Launch Plan ($19) seria o custo real. |

### 4. Z-API (WhatsApp Business)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Z-API (WhatsApp Business API não-oficial) |
| **Função no projeto** | Canal de comunicação: enviar/receber mensagens WhatsApp, webhook |
| **É essencial?** | **SIM. CORE DO PRODUTO.** |
| **Pode ser removido?** | Não sem quebrar o produto. Alternativas: WhatsApp Cloud API oficial (Meta) ou 360dialog. |
| **Pode ser substituído por self-hosted?** | ❌ Não. WhatsApp não tem API self-hosted. Alternativas open-source (WhatsApp Web via Baileys/lib) são contra os ToS e arriscadas para healthtech. |
| **Pode rodar em Docker?** | N/A — é SaaS |
| **Risco de remoção** | **Crítico.** Sem WhatsApp, o produto deixa de existir. |
| **Esforço de migração** | N/A (não migrar) |
| **Economia potencial** | $0 (não é substituível) |
| **Recomendação** | **Manter.** Código já suporta fallback para 360dialog/Meta/Twilio se quiser migrar de provider, mas sempre será SaaS pago. |

### 5. Stripe (Pagamentos)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Stripe (Checkout + Webhooks) |
| **Função no projeto** | Cobrança recorrente, gestão de assinaturas, webhook de confirmação |
| **É essencial?** | Sim. Sem pagamento, não há receita. |
| **Pode ser removido?** | Não sem quebrar o modelo de negócio. |
| **Pode ser substituído por self-hosted?** | ❌ Não. Gateway de pagamento regulado (PCI-DSS). Self-hosted inviável e arriscado. |
| **Pode rodar em Docker?** | N/A — é SaaS |
| **Risco de remoção** | **Crítico.** Compliance financeiro. |
| **Esforço de migração** | N/A (não migrar). Alternativas: Mercado Pago (Brasil), PagSeguro, mas todos SaaS. |
| **Economia potencial** | Stripe cobra % por transação. Migrar de gateway não reduz esse custo — todos cobram %. |
| **Recomendação** | **Manter.** Stripe é o padrão ouro para SaaS. Está bem integrado (webhook com HMAC + idempotência). |

### 6. Anthropic Claude (IA)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Anthropic Claude API (Sonnet 4.6 + Haiku 4.5) |
| **Função no projeto** | Conduzir onboarding conversacional + extrair JSON estruturado de medicamentos |
| **É essencial?** | Sim para o fluxo atual. Onboarding sem Claude seria um form estático (perde a magia). |
| **Pode ser removido?** | Sim, com adaptação: substituir por form web + WhatsApp com respostas fixas. Mas perde qualidade. |
| **Pode ser substituído por self-hosted?** | ⚠️ Parcial. Modelos open-source (Llama 3, Mistral) via Ollama exigiriam GPU (custo extra) e a qualidade da conversa em português seria inferior. |
| **Pode rodar em Docker?** | ✅ Ollama + modelo open-source, mas precisa de GPU (custo de VPS com GPU: $50-200/mês) |
| **Risco de remoção** | Alto. Onboarding é o momento de ativação do paciente. Se a conversa for ruim, churn sobe. |
| **Esforço de migração** | 20-40 horas. Reescrever pipeline de extração, testar qualidade, calibrar prompts. |
| **Economia potencial** | Anthropic cobra ~$3/1M tokens input, $15/1M output. Volume atual é baixo ($1-5/mês). Self-hosted com GPU custa mais que isso. |
| **Recomendação** | **Manter.** Custo atual é irrisório. Migrar para self-hosted só se volume crescer 100x. |

### 7. Redis (Railway addon → container)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Redis (provisionado pelo Railway) |
| **Função no projeto** | BullMQ backend, cache de health, dedup de webhook, med-schedule-cache |
| **É essencial?** | Sim. BullMQ depende de Redis. |
| **Pode ser removido?** | Sim, migrando para container Redis na VPS. |
| **Pode ser substituído por self-hosted?** | ✅ Sim. Redis em Docker é trivial. |
| **Pode rodar em Docker?** | ✅ Sim. `redis:7-alpine` com volume para persistência AOF/RDB. |
| **Risco de remoção** | Baixo. Redis é stateless para BullMQ (jobs são efêmeros). Cache de health é regenerável. |
| **Esforço de migração** | 1-2 horas. Container Redis, atualizar REDIS_URL, testar filas. |
| **Economia potencial** | $0 (já incluso no Railway). Na VPS, sem custo adicional. |
| **Recomendação** | **Migrar junto com a API.** Container Redis na mesma VPS. |

### 8. Sentry (Observabilidade)

| Campo | Valor |
|-------|-------|
| **Serviço atual** | Sentry (não ativo — opcional via `SENTRY_DSN`) |
| **Função no projeto** | Captura de erros, stack traces |
| **É essencial?** | Não. Código funciona sem. |
| **Pode ser removido?** | Já é opcional. Nada a remover. |
| **Pode ser substituído por self-hosted?** | ✅ Sim. Sentry self-hosted (docker), GlitchTip, ou Prometheus + Grafana. |
| **Pode rodar em Docker?** | ✅ Sentry self-hosted é dockerizado. Mas pesado (mín 4GB RAM). |
| **Risco de remoção** | Nenhum. Não está ativo. |
| **Esforço de migração** | 2-4 horas. Configurar Sentry self-hosted ou alternativa leve (GlitchTip). |
| **Economia potencial** | $0-26/mês → $0 (self-hosted na VPS, se couber) |
| **Recomendação** | **Manter opcional.** Se ativar, usar free tier do Sentry Cloud ($0 para volume baixo) ou GlitchTip self-hosted leve. |

---

## TABELA-RESUMO DE MIGRABILIDADE

| Serviço | Pode migrar? | Esforço | Risco | Economia/mês | Recomendação |
|---------|-------------|---------|-------|-------------|--------------|
| Railway | ✅ Sim | 4-8h | Médio | $20-25 | **Migrar** |
| Vercel | ✅ Sim | 2-4h | Baixo | $0-20 | **Migrar** |
| Neon | ⚠️ Sim | 6-12h | Alto | $0-19 | **Adiar** (manter) |
| Redis | ✅ Sim | 1-2h | Baixo | $0 | **Migrar** (junto com API) |
| Z-API | ❌ Não | — | Crítico | $0 | **Manter** |
| Stripe | ❌ Não | — | Crítico | $0 | **Manter** |
| Anthropic | ⚠️ Parcial | 20-40h | Alto | $0-5 | **Manter** |
| Sentry | ⚠️ Parcial | 2-4h | Nenhum | $0-26 | **Manter opcional** |

---

## TRÊS CENÁRIOS DE CENTRALIZAÇÃO

### 📊 CENÁRIO A — Conservador (mínima alteração, menor risco)

**Estratégia:** Remove apenas Vercel; mantém Railway + Neon + Z-API + Stripe + Anthropic.

**O que muda:**
- Frontend Next.js sai do Vercel e vai para VPS própria (Caddy/Nginx + Docker)
- API + Workers + Redis continuam no Railway
- Neon, Z-API, Stripe, Anthropic mantidos como estão

**Custo estimado mensal:**

| Item | Antes | Depois |
|------|-------|--------|
| Railway (API + Workers + Redis) | $20-25 | $20-25 |
| Vercel | $0-20 | $0 |
| VPS (frontend) | $0 | $6-12 |
| Neon | $0-19 | $0-19 |
| Z-API | $10 | $10 |
| Stripe | Variável | Variável |
| Anthropic | $1-5 | $1-5 |
| **Total** | **$31-79** | **$37-71** |

| Indicador | Valor |
|-----------|-------|
| **Complexidade** | 🟢 Baixa |
| **Risco** | 🟢 Baixo |
| **Prazo técnico** | 2-3 dias |
| **Impacto no código** | Mínimo (ajustar next.config.js + criar Dockerfile web + Caddyfile) |
| **Impacto no banco** | Nenhum |
| **Impacto no deploy** | Moderado (2 alvos: Railway + VPS) |
| **Impacto na operação** | Baixo (VPS requer manutenção básica) |
| **Recomendação final** | ⭐⭐⭐ Bom primeiro passo. Reduz 1 plataforma, baixo risco. |

---

### 📊 CENÁRIO B — Centralização Forte (máxima consolidação em VPS)

**Estratégia:** Migrar TUDO que é tecnicamente viável para uma VPS única com Docker Compose. GitHub Actions para CI/CD.

**O que muda:**
- Railway → VPS (API + Workers + Redis em containers Docker)
- Vercel → VPS (Next.js standalone em container Docker)
- Neon → PostgreSQL container na VPS (com volumes + backup S3)
- Caddy como reverse proxy + SSL automático
- Redis em container na VPS
- Mantém apenas: Z-API, Stripe, Anthropic (essenciais ao negócio)

**Custo estimado mensal:**

| Item | Antes | Depois |
|------|-------|--------|
| Railway (tudo) | $20-25 | $0 |
| Vercel | $0-20 | $0 |
| VPS (4GB, 2vCPU, 80GB) | $0 | $20-24 |
| Backup S3 (DB dumps) | $0 | $2-5 |
| Neon | $0-19 | $0 |
| Z-API | $10 | $10 |
| Stripe | Variável | Variável |
| Anthropic | $1-5 | $1-5 |
| **Total** | **$31-79** | **$33-44** |

| Indicador | Valor |
|-----------|-------|
| **Complexidade** | 🟠 Média-Alta |
| **Risco** | 🟠 Médio (banco self-hosted é o ponto crítico) |
| **Prazo técnico** | 2-4 semanas |
| **Impacto no código** | Moderado. Ajustar driver Neon → pg (TCP), configurar compose, CI/CD |
| **Impacto no banco** | **Alto.** pg_dump/restore, validar enums, FKs, índices. Estratégia de backup obrigatória. |
| **Impacto no deploy** | Alto (reestruturação completa: 1 VPS, compose, GitHub Actions) |
| **Impacto na operação** | Alto (VPS requer administração: updates, security patches, backups, monitoring) |
| **Recomendação final** | ⭐⭐⭐⭐⭐ Melhor relação custo-benefício a médio prazo. Requer disciplina operacional. |

---

### 📊 CENÁRIO C — Híbrido Estratégico (mantém o que faz sentido gerenciado, centraliza o resto)

**Estratégia:** Manter Neon gerenciado (banco de dados é crítico), mas centralizar computação (API + Web + Workers + Redis) em VPS.

**O que muda:**
- Railway → VPS (API + Workers + Redis)
- Vercel → VPS (Next.js)
- Neon → **Mantém** (gerenciado, backups, branching)
- Caddy como reverse proxy
- Redis em container na VPS
- Mantém: Z-API, Stripe, Anthropic

**Custo estimado mensal:**

| Item | Antes | Depois |
|------|-------|--------|
| Railway (tudo) | $20-25 | $0 |
| Vercel | $0-20 | $0 |
| VPS (2GB, 2vCPU, 40GB) | $0 | $12-18 |
| Neon Launch ($19) | $0-19 | $19 |
| Z-API | $10 | $10 |
| Stripe | Variável | Variável |
| Anthropic | $1-5 | $1-5 |
| **Total** | **$31-79** | **$42-52** |

| Indicador | Valor |
|-----------|-------|
| **Complexidade** | 🟢 Baixa-Média |
| **Risco** | 🟢 Baixo (banco permanece gerenciado) |
| **Prazo técnico** | 1-2 semanas |
| **Impacto no código** | Baixo. Ajustar Dockerfiles, compose, CI/CD. Driver Neon mantido. |
| **Impacto no banco** | Nenhum. Neon permanece como está. |
| **Impacto no deploy** | Moderado (único alvo VPS + GitHub Actions) |
| **Impacto na operação** | Médio (VPS + Neon gerenciado = meio termo) |
| **Recomendação final** | ⭐⭐⭐⭐ Melhor equilíbrio. Banco gerenciado = paz de espírito. Computação centralizada = custo previsível. |

---

## COMPARATIVO FINAL DOS CENÁRIOS

| Dimensão | Cenário A (Conservador) | Cenário B (Centralização Forte) | Cenário C (Híbrido) |
|----------|------------------------|-------------------------------|---------------------|
| **Custo/mês** | $37-71 | **$33-44** | $42-52 |
| **Economia vs atual** | ~10-15% | **~40-50%** | ~20-30% |
| **Plataformas** | 4 (Railway, Neon, Z-API, Stripe) | **1 VPS + 3 SaaS** | 1 VPS + 4 SaaS |
| **Complexidade** | Baixa | Alta | Média |
| **Risco** | Baixo | Médio | Baixo |
| **Prazo** | 2-3 dias | 2-4 semanas | 1-2 semanas |
| **Admin operacional** | Baixo | Alto | Médio |
| **Backup de dados** | Neon gerencia | **Você gerencia** | Neon gerencia |
| **Escalabilidade** | Média (Railway escala) | Manual (upgrade VPS) | Manual (upgrade VPS) |
| **Recomendado para** | Primeiro passo seguro | Meta de longo prazo | **Melhor equilíbrio hoje** |

---

## RECOMENDAÇÃO FINAL

**Cenário C — Híbrido Estratégico** é a recomendação primária para este momento:

1. **Centralize computação** (API + Web + Workers + Redis) em 1 VPS com Docker Compose
2. **Mantenha Neon gerenciado** para o banco de dados (dados de saúde = não arriscar)
3. **Mantenha Z-API, Stripe, Anthropic** (essenciais, sem alternativa self-hosted viável)
4. **Use GitHub Actions** para CI/CD (build + teste + deploy)
5. **Adicione Caddy** como reverse proxy com SSL automático
6. **Implemente backups** do Neon via `pg_dump` agendado para S3-compatible

**Economia estimada:** ~$50 → ~$45/mês (redução modesta mas com ganho de controle e previsibilidade)

**Próximo passo:** Evoluir para Cenário B quando:
- Volume de dados justificar migração do Neon (DB > 1GB)
- Equipe tiver maturidade operacional para gerenciar PostgreSQL
- Backup e disaster recovery estiverem validados
