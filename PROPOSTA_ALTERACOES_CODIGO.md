# PROPOSTA DE ALTERAÇÕES DE CÓDIGO — LEMBRYMED

**Data:** 07/07/2026
**Status:** ⚠️ PROPOSTA — NENHUMA ALTERAÇÃO FOI APLICADA AINDA
**Aprovação necessária:** SIM, antes de qualquer modificação

---

## CLASSIFICAÇÃO DAS ALTERAÇÕES

| Classificação | Significado |
|--------------|-------------|
| 🔴 **Obrigatória** | Sem isso, a centralização não funciona |
| 🟠 **Recomendada** | Melhora segurança, performance ou operação |
| 🟡 **Opcional** | Diferencial, mas não essencial |
| 🔵 **Arriscada** | Pode quebrar algo; testar exaustivamente |
| ⚪ **Não recomendada** | Custo/risco > benefício no momento |

---

## ARQUIVOS A CRIAR

### 1. `docker-compose.yml` (desenvolvimento local)

| Campo | Valor |
|-------|-------|
| **Finalidade** | Rodar stack completa localmente (API + Web + Redis + PostgreSQL local) sem depender de serviços externos |
| **Impacto** | Desenvolvimento mais rápido, sem depender de Neon/Railway para testar |
| **Risco** | 🟢 Nenhum (arquivo novo, não afeta produção) |
| **Classificação** | 🔴 **Obrigatória** — base para todo o resto |
| **Conteúdo esperado** | Serviços: api (Dockerfile), web (Dockerfile), redis, postgres. Volumes para redis_data e pg_data. Rede interna `lembrymed-net`. |
| **Depende de info externa?** | Não. Totalmente autossuficiente. |

### 2. `docker-compose.prod.yml` (produção)

| Campo | Valor |
|-------|-------|
| **Finalidade** | Rodar stack de produção na VPS (sem PostgreSQL local — usa Neon) |
| **Impacto** | Substitui Railway. Deploy passa a ser `docker compose up -d` |
| **Risco** | 🟡 Médio (se mal configurado, expõe portas ou perde dados) |
| **Classificação** | 🔴 **Obrigatória** — essencial para o deploy na VPS |
| **Conteúdo esperado** | Serviços: caddy, api, web, redis. Volumes persistentes. Networks. Healthchecks. Restart policies. Logging config. |
| **Depende de info externa?** | Sim. `DATABASE_URL` e `REDIS_URL` como env vars (valores reais do Neon). Domínio para Caddy. |

### 3. `Caddyfile`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Configuração do Caddy como reverse proxy com SSL automático |
| **Impacto** | Substitui o proxy do Railway e o roteamento do Vercel |
| **Risco** | 🟡 Médio (se roteamento errado, site fica offline) |
| **Classificação** | 🔴 **Obrigatória** — sem proxy reverso, não há HTTPS |
| **Conteúdo esperado** | Domínio `lembrymed.com.br`, `api.lembrymed.com.br`. Roteamento `/api/*` → api:3000, `/*` → web:3001. Headers de segurança. |
| **Depende de info externa?** | Sim. Domínio real (`lembrymed.com.br`). Email para Let's Encrypt. |

### 4. `apps/web/Dockerfile` (Next.js standalone)

| Campo | Valor |
|-------|-------|
| **Finalidade** | Build e runtime do Next.js em container Docker |
| **Impacto** | Permite deploy do frontend na VPS sem Vercel |
| **Risco** | 🟢 Baixo (Next.js standalone é suportado oficialmente) |
| **Classificação** | 🔴 **Obrigatória** — sem isso, frontend não roda na VPS |
| **Conteúdo esperado** | Multi-stage: (1) build: `node:20-slim`, npm ci, next build; (2) runtime: `node:20-slim`, copiar `.next/standalone` + `public/`, `CMD ["node", "server.js"]` |
| **Depende de info externa?** | Não. Totalmente autossuficiente. |

### 5. `.github/workflows/deploy.yml`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Deploy automatizado via GitHub Actions → SSH → VPS |
| **Impacto** | `git push main` → deploy automático em produção |
| **Risco** | 🟠 Alto (se mal configurado, pode derrubar produção) |
| **Classificação** | 🟠 **Recomendada** — automação de deploy |
| **Conteúdo esperado** | Workflow: checkout → SSH na VPS → git pull → docker compose up -d → healthcheck |
| **Depende de info externa?** | Sim. Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (precisa configurar no GitHub). |

### 6. `scripts/backup.sh`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Backup automatizado do banco Neon → arquivo local + S3 |
| **Impacto** | Segurança de dados. Sem backup, risco de perda total. |
| **Risco** | 🟢 Nenhum (script novo, não afeta runtime) |
| **Classificação** | 🔴 **Obrigatória** — saúde de dados |
| **Conteúdo esperado** | `pg_dump` do Neon com timestamp, limpeza de backups antigos (>30d), sync com S3/B2 |
| **Depende de info externa?** | Sim. `DATABASE_URL_UNPOOLED` (Neon). Credenciais S3 (se usar offsite). |

### 7. `scripts/deploy.sh`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Script de deploy manual na VPS (fallback se GitHub Actions falhar) |
| **Impacto** | Permite deploy sem depender do GitHub Actions |
| **Risco** | 🟢 Baixo |
| **Classificação** | 🟠 **Recomendada** |
| **Conteúdo esperado** | `git pull`, `docker compose build`, `docker compose up -d`, `curl healthcheck` |
| **Depende de info externa?** | Não. |

### 8. `scripts/restore.sh`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Restaurar banco a partir de arquivo dump |
| **Impacto** | Recuperação de desastres |
| **Risco** | 🔵 **Arriscada** — restore em produção pode sobrescrever dados |
| **Classificação** | 🟠 **Recomendada** — para emergências |
| **Conteúdo esperado** | `pg_restore` com confirmação interativa, logging |
| **Depende de info externa?** | Sim. `DATABASE_URL_UNPOOLED` e caminho do dump. |

### 9. `scripts/healthcheck.sh`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Verificação periódica da saúde da stack (cron a cada 5min) |
| **Impacto** | Alerta precoce de problemas |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟡 **Opcional** — já existe `/health` endpoint |
| **Conteúdo esperado** | `curl localhost:3000/health`, notificar admin se `status != ok` |

### 10. `README_DEPLOY.md`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Documentar deploy para humano não técnico (Marcus) |
| **Impacto** | Autonomia operacional |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟠 **Recomendada** |
| **Conteúdo esperado** | Passo a passo: contratar VPS, clonar repo, configurar .env, docker compose up, verificar |

### 11. `HEALTHCHECK.md`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Documentar todos os healthchecks e o que fazer se falharem |
| **Impacto** | Runbook operacional |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟡 **Opcional** |

### 12. `MIGRATIONS.md`

| Campo | Valor |
|-------|-------|
| **Finalidade** | Documentar política de migrations (Drizzle + Neon) |
| **Impacto** | Evita migração destrutiva acidental |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟠 **Recomendada** |

---

## ARQUIVOS A ALTERAR

### A1. `next.config.js` (ou `next.config.ts`) — output standalone

| Campo | Valor |
|-------|-------|
| **Finalidade** | Configurar Next.js para modo standalone (Docker) |
| **Impacto** | Build gera pasta autossuficiente que roda sem node_modules |
| **Alteração** | Adicionar `output: 'standalone'` |
| **Risco** | 🟢 Baixo. Recurso oficial do Next.js. |
| **Classificação** | 🔴 **Obrigatória** — sem isso, container web não funciona |
| **Depende de info externa?** | Não. |

### A2. `packages/database/index.ts` — driver substituição (apenas Cenário B)

| Campo | Valor |
|-------|-------|
| **Finalidade** | Trocar driver Neon HTTP por `pg` (TCP) para PostgreSQL self-hosted |
| **Impacto** | Conexão direta ao PostgreSQL local em vez de HTTP para Neon |
| **Alteração** | `import { neon } from '@neondatabase/serverless'` → `import { Pool } from 'pg'` |
| **Risco** | 🔵 **Arriscada.** Pode quebrar queries, transações, pool. |
| **Classificação** | 🔵 **Arriscada** — só aplicar no Cenário B (centralização total) |
| **Depende de info externa?** | Não. |

### A3. `apps/api/Dockerfile` — revisão

| Campo | Valor |
|-------|-------|
| **Finalidade** | Garantir que Dockerfile funciona no novo contexto (VPS Docker Compose) |
| **Impacto** | Já existe e funciona no Railway. Pode precisar de ajustes mínimos. |
| **Alteração** | Verificar externals do esbuild, healthcheck, user não-root |
| **Risco** | 🟢 Baixo (já testado em produção Railway) |
| **Classificação** | 🟠 **Recomendada** — pequenas melhorias |
| **Depende de info externa?** | Não. |

### A4. `.env.example` — atualização

| Campo | Valor |
|-------|-------|
| **Finalidade** | Refletir nova arquitetura (remover referências Railway, adicionar VPS) |
| **Impacto** | Documentação |
| **Alteração** | Atualizar comentários, adicionar `VPS_HOST` se necessário |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟠 **Recomendada** |

### A5. `README.md` — atualização

| Campo | Valor |
|-------|-------|
| **Finalidade** | Atualizar stack e instruções de deploy |
| **Impacto** | Onboarding de novos devs |
| **Alteração** | Atualizar seção "Deploy", adicionar link para README_DEPLOY.md |
| **Risco** | 🟢 Nenhum |
| **Classificação** | 🟡 **Opcional** (pode ser feito por último) |

### A6. `apps/api/src/config/env.ts` — validação

| Campo | Valor |
|-------|-------|
| **Finalidade** | Adicionar validação para novas env vars se necessário |
| **Impacto** | Segurança |
| **Alteração** | Se adicionar `VPS_HOST` ou `BACKUP_S3_BUCKET`, validar no schema |
| **Risco** | 🟢 Baixo |
| **Classificação** | 🟡 **Opcional** |

---

## CLASSIFICAÇÃO FINAL DAS ALTERAÇÕES

### 🔴 Obrigatórias (sem elas, centralização não funciona)

| # | Arquivo | Ação |
|---|---------|------|
| 1 | `docker-compose.yml` | Criar |
| 2 | `docker-compose.prod.yml` | Criar |
| 3 | `Caddyfile` | Criar |
| 4 | `apps/web/Dockerfile` | Criar |
| 5 | `scripts/backup.sh` | Criar |
| 6 | `next.config.js` — `output: 'standalone'` | Alterar |

### 🟠 Recomendadas (melhoram segurança/operação)

| # | Arquivo | Ação |
|---|---------|------|
| 7 | `.github/workflows/deploy.yml` | Criar |
| 8 | `scripts/deploy.sh` | Criar |
| 9 | `scripts/restore.sh` | Criar |
| 10 | `README_DEPLOY.md` | Criar |
| 11 | `MIGRATIONS.md` | Criar |
| 12 | `apps/api/Dockerfile` — revisão | Alterar |
| 13 | `.env.example` — atualização | Alterar |

### 🟡 Opcionais (diferenciais)

| # | Arquivo | Ação |
|---|---------|------|
| 14 | `scripts/healthcheck.sh` | Criar |
| 15 | `HEALTHCHECK.md` | Criar |
| 16 | `README.md` — atualização | Alterar |
| 17 | `apps/api/src/config/env.ts` — validação extra | Alterar |

### 🔵 Arriscadas (testar exaustivamente)

| # | Arquivo | Ação |
|---|---------|------|
| 18 | `packages/database/index.ts` — driver pg (Cenário B) | Alterar |

### ⚪ Não recomendadas (custo/risco > benefício)

| # | Ação | Motivo |
|---|------|--------|
| 19 | Migrar Anthropic → Ollama self-hosted | GPU custa mais que API Anthropic ($1-5/mês vs $50-200/mês) |
| 20 | Migrar Z-API → WhatsApp Web library | Violação dos ToS, risco de banimento, instável |
| 21 | Migrar Stripe → gateway self-hosted | Inviável (PCI-DSS compliance) |

---

## RESUMO PARA APROVAÇÃO

**Total de arquivos a criar:** 12
**Total de arquivos a alterar:** 6
**Total de alterações obrigatórias:** 6
**Total de alterações recomendadas:** 7

**⚠️ NENHUMA DESTAS ALTERAÇÕES FOI APLICADA AINDA.**

Para prosseguir, preciso da sua aprovação explícita sobre:
1. Quais arquivos criar/alterar
2. Se seguimos o Cenário C (Híbrido — recomendado) ou outro
3. Se posso começar a criar os arquivos de infraestrutura (não afetam código de produção)

Após aprovação, executarei na ordem:
1. Criar `docker-compose.yml` (dev local, seguro)
2. Criar `docker-compose.prod.yml`
3. Criar `Caddyfile`
4. Criar `apps/web/Dockerfile`
5. Criar `scripts/backup.sh`
6. Alterar `next.config.js`
7. Criar `.github/workflows/deploy.yml`
8. ... demais arquivos
