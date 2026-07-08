# PLANO DE IMPLANTAÇÃO VIA GITHUB — LEMBRYMED

**Data:** 07/07/2026
**Referência:** AUDITORIA_TECNICA_HERMES.md, MATRIZ_CENTRALIZACAO_CUSTOS.md
**Objetivo:** Rota de implantação profissional usando GitHub como centro operacional.

---

## 1. ESTRATÉGIA DE BRANCHES

Adotar **Trunk-Based Development** (recomendado para time pequeno / solo dev):

```
main (produção)
  │
  ├── audit/hermes-centralizacao-infra  ← esta auditoria
  │
  ├── fix/onda-3-hardening-seguranca    ← já existe (PR #4 pendente)
  │
  └── feature/<nome-da-feature>         ← branches de features
```

**Regras:**
- `main` = produção. Só recebe merge via PR aprovado.
- Branches de feature são curtas (1-3 dias). Merge frequente para evitar conflitos.
- Commits usam [Conventional Commits](https://conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `security:`.

---

## 2. BRANCH SUGERIDA PARA ESTA AUDITORIA

```bash
git checkout -b audit/hermes-centralizacao-infra
```

Esta branch conterá TODOS os arquivos de auditoria (`.md`) e, se aprovado, os arquivos de infraestrutura (Dockerfiles, compose, CI, scripts).

---

## 3. ESTRATÉGIA DE PULL REQUEST

### Template de PR (`.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## O que foi feito
<!-- Descreva as mudanças em 1-2 frases -->

## Tipo de mudança
- [ ] feat: nova funcionalidade
- [ ] fix: correção de bug
- [ ] docs: documentação
- [ ] chore: infra/config/build
- [ ] security: correção de segurança
- [ ] refactor: refatoração sem mudança funcional

## Checklist
- [ ] Build passa (`npm run build`)
- [ ] Typecheck passa (`npm run typecheck`)
- [ ] Testes passam (`npm test`)
- [ ] Lint passa (`npm run lint`)
- [ ] Nenhum segredo exposto
- [ ] .env.example atualizado se novas env vars
- [ ] Documentação atualizada (docs/, README)

## Breaking changes?
<!-- Liste mudanças que quebram compatibilidade -->

## Screenshots (se UI)
<!-- Cole screenshots do antes/depois -->
```

### Workflow de PR:
1. Desenvolvedor abre PR da feature → `main`
2. CI roda automaticamente (typecheck + build + test)
3. Revisão humana (Marcus) aprova
4. Merge squash (1 commit por PR, mensagem limpa)
5. Branch da feature é deletada após merge

---

## 4. CHECKLIST ANTES DO PRIMEIRO COMMIT

- [ ] Confirmar que `.gitignore` está correto (node_modules, .env, dist, .next, .turbo)
- [ ] Confirmar que `.env.example` está atualizado (sem valores reais)
- [ ] Verificar que nenhum `.env` real está tracked (`git ls-files | grep .env`)
- [ ] Rodar `npm run typecheck` — deve passar
- [ ] Rodar `npm test` — 27 testes devem passar
- [ ] Rodar `npm run build` — build do web deve passar
- [ ] Verificar que não há arquivos grandes desnecessários (>1MB) no commit
- [ ] Confirmar que `package-lock.json` está consistente

---

## 5. GITHUB ACTIONS RECOMENDADO

### CI Principal (`.github/workflows/ci.yml`)

Baseado no `AUDIT/CI-SUGGESTED.yml` existente, com melhorias:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    name: Typecheck + Build + Test
    runs-on: ubuntu-latest
    timeout-minutes: 15

    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install
        run: npm ci --no-audit --no-fund

      - name: Typecheck (API)
        working-directory: apps/api
        run: npx tsc --noEmit
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          STRIPE_SECRET_KEY: sk_test_dummykeyfordummyuseonly123456
          STRIPE_WEBHOOK_SECRET: whsec_dummy
          STRIPE_PRICE_ANNUAL: price_dummy
          ANTHROPIC_API_KEY: sk-ant-dummy
          ADMIN_EMAIL: ci@example.com
          ADMIN_PASSWORD_HASH: $2a$12$CIdummyCIdummyCIdummyCIdummyCIdummyCIdummyCIdummy
          NEXTAUTH_SECRET: ci-test-secret-chave-minima-32-chars-ok
          WEB_URL: https://example.com
          ZAPI_INSTANCE_ID: test
          ZAPI_TOKEN: test
          ZAPI_WEBHOOK_TOKEN: ci-test-webhook-token-16+chars
          NODE_ENV: test

      - name: Build (Web)
        working-directory: apps/web
        run: npm run build
        env:
          NEXT_PUBLIC_API_URL: https://api.example.com
          STRIPE_SECRET_KEY: sk_test_dummykeyfordummyuseonly123456
          STRIPE_PRICE_ANNUAL: price_dummy

      - name: Test (API + shared)
        working-directory: apps/api
        run: npm test
```

### Deploy para VPS (`.github/workflows/deploy.yml` — criar após aprovação do Cenário C):

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:  # permite deploy manual

jobs:
  deploy:
    name: Deploy to VPS
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/lembrymed
            git pull origin main
            docker compose -f docker-compose.prod.yml up -d --build
            docker compose -f docker-compose.prod.yml exec -T api npx drizzle-kit push
```

---

## 6. FLUXO DE BUILD

```
┌──────────────┐
│  git push    │
│  (feature →  │
│   PR → main) │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────┐
│  GitHub Actions: CI             │
│  1. Checkout                    │
│  2. Setup Node 20               │
│  3. npm ci                      │
│  4. Typecheck API (tsc --noEmit)│
│  5. Build Web (next build)      │
│  6. Test API (vitest)           │
└──────────┬──────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌──────────┐
│ PASS   │  │ FAIL     │
│ Deploy │  │ Notificar│
│ (main) │  │ no PR    │
└────────┘  └──────────┘
```

---

## 7. FLUXO DE TESTE

```
┌──────────────────────────────────────┐
│  CI Pipeline (automático)            │
│  ├── TypeScript check (API)          │
│  ├── Build Next.js (Web)             │
│  └── Vitest unit tests (27 testes)   │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│  Ambiente Staging (manual pós-CI)    │
│  ├── Smoke test: healthcheck         │
│  ├── Fluxo onboarding completo       │
│  ├── Lembrete + confirmação          │
│  ├── Alerta familiar                 │
│  ├── Login admin + dashboard         │
│  └── Webhook Stripe (modo teste)     │
└──────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────┐
│  Produção (após staging OK)          │
│  ├── Deploy main → VPS              │
│  ├── Healthcheck pós-deploy          │
│  ├── Verificar filas BullMQ          │
│  └── Smoke test mínimo (1 paciente)  │
└──────────────────────────────────────┘
```

---

## 8. FLUXO DE DEPLOY (Cenário C — Híbrido)

```
main branch push
       │
       ▼
┌──────────────────────────┐
│ GitHub Actions: Deploy   │
│                          │
│ SSH → VPS                │
│ ├── git pull main        │
│ ├── docker compose build │
│ ├── docker compose up -d │
│ └── healthcheck curl     │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ VPS (Docker Compose)     │
│ ┌──────────────────────┐ │
│ │ Caddy (SSL auto)     │ │
│ │ :443 → web:3000      │ │
│ │ :443 → /api → api:3000│ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ api (Express+Workers)│ │
│ │ web (Next.js)        │ │
│ │ redis (Redis 7)      │ │
│ └──────────────────────┘ │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Neon (PostgreSQL)        │
│ ← conexão via DATABASE_URL│
└──────────────────────────┘
```

---

## 9. ESTRATÉGIA DE ROLLBACK

### Rollback imediato (VPS):
```bash
# No servidor:
cd /opt/lembrymed
git log --oneline -5           # ver últimos commits
git revert <commit-hash>       # reverter commit específico
# ou
git reset --hard <commit-hash> # voltar para commit estável
docker compose -f docker-compose.prod.yml up -d --build
```

### Rollback via GitHub Actions (workflow dedicado):
```yaml
name: Rollback
on: workflow_dispatch
  inputs:
    commit:
      description: 'Commit hash to rollback to'
      required: true
jobs:
  rollback:
    # ... SSH → git reset --hard ${{ inputs.commit }} → docker compose up -d
```

### Rollback de migration (Neon):
- Migrations são aditivas. Rollback = criar migration reversa.
- Se migration quebrou algo: restaurar snapshot do Neon (branching feature) ou pg_restore.

---

## 10. GESTÃO DE SECRETS

### Onde os secrets vivem:

| Ambiente | Secrets armazenados em |
|----------|----------------------|
| CI/CD | GitHub Secrets (`Settings > Secrets and variables > Actions`) |
| VPS | Arquivo `.env` no servidor (protegido por permissões `600`, owner root) |
| Desenvolvimento local | `.env` (gitignored, nunca commitado) |

### Secrets necessários no GitHub Actions:

| Nome do Secret | Uso |
|---------------|-----|
| `VPS_HOST` | IP/domínio da VPS |
| `VPS_USER` | Usuário SSH |
| `VPS_SSH_KEY` | Chave privada SSH |
| `NEON_DATABASE_URL_UNPOOLED` | Para migration no deploy |
| `STRIPE_WEBHOOK_SECRET` | (se precisar testar webhook no CI) |

### Política:
- NUNCA commitar `.env`
- NUNCA hardcodar secrets no código
- Usar `.env.example` com placeholders
- Rotacionar secrets a cada 90 dias (ou após incidente)
- Secrets de produção NUNCA no CI (apenas valores dummy para testes)

---

## 11. ESTRATÉGIA PARA AMBIENTE STAGING

### Opção A: Segundo domínio na mesma VPS
```
staging.lembrymed.com.br → VPS (docker-compose.staging.yml)
- Portas diferentes (3001, 3002, 6380)
- Banco: branch separado no Neon (staging-preview)
```

### Opção B: VPS separada (mais segura, custo adicional)
```
VPS Staging ($12/mês) → cópia exata da produção
```

**Recomendação:** Opção A para começar. Branch Neon staging isolada para dados.

---

## 12. ESTRATÉGIA PARA AMBIENTE PRODUÇÃO

### VPS recomendada:
- **Provedor:** Hetzner CX22 (2 vCPU, 4GB RAM, 40GB SSD, 20TB tráfego) — ~€4/mês
- **Alternativa:** DigitalOcean Droplet ($24/mês) ou Hostinger VPS
- **Sistema:** Ubuntu 22.04 LTS
- **Domínio:** lembrymed.com.br (já existe) + api.lembrymed.com.br

### Estrutura no servidor:
```
/opt/lembrymed/
├── docker-compose.prod.yml
├── docker-compose.staging.yml
├── Caddyfile
├── .env                    ← secrets (chmod 600)
├── scripts/
│   ├── backup.sh           ← pg_dump agendado
│   ├── deploy.sh           ← puxa git + rebuild
│   └── restore.sh          ← pg_restore
└── data/
    ├── redis/              ← volume persistente
    └── backups/            ← dumps do banco
```

---

## 13. POLÍTICA DE BACKUP

### Banco de dados (Neon → PostgreSQL dump):

```bash
#!/bin/bash
# scripts/backup.sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/lembrymed/data/backups"
RETENTION_DAYS=30

# Dump do Neon
pg_dump "$DATABASE_URL_UNPOOLED" \
  --format=custom \
  --file="$BACKUP_DIR/lembrymed_$TIMESTAMP.dump"

# Remover backups > 30 dias
find "$BACKUP_DIR" -name "*.dump" -mtime +$RETENTION_DAYS -delete

# Sincronizar com S3 (se configurado)
# aws s3 sync "$BACKUP_DIR" s3://lembrymed-backups/
```

### Agendamento (cron na VPS):
```
0 3 * * * /opt/lembrymed/scripts/backup.sh >> /var/log/lembrymed-backup.log 2>&1
```

### Política:
- Backup diário (3:00 AM BRT)
- Retenção local: 30 dias
- Retenção S3: 90 dias (opcional, ~$2/mês)
- Teste de restore mensal (restaurar em staging e validar)

---

## 14. POLÍTICA DE LOGS

### API (Winston):
- Logs em JSON estruturado
- Output: stdout/stderr (capturado pelo Docker)
- Rotação: Docker log driver `json-file` com `max-size: 10m`, `max-file: 3`

### Docker Compose:
```yaml
services:
  api:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Agregação futura:
- Loki + Grafana (self-hosted na VPS)
- Ou SaaS: Sentry (já suportado), Logtail

---

## 15. POLÍTICA DE VERSIONAMENTO

### SemVer (Major.Minor.Patch):
- **Major:** Breaking changes (ex: migrar Neon → PostgreSQL self-hosted)
- **Minor:** Novas features (ex: notificação SMS)
- **Patch:** Bug fixes, security patches

### Tags no Git:
```bash
git tag -a v2.11.0 -m "Centralização de infraestrutura"
git push origin v2.11.0
```

### CHANGELOG:
- Manter `CHANGELOG.md` atualizado a cada release
- Formato: [Keep a Changelog](https://keepachangelog.com/)

---

## 16. POLÍTICA DE MIGRATIONS

### Drizzle Kit (schema → SQL):
```bash
# Gerar migration a partir do schema.ts
npm --workspace packages/database run db:generate

# Aplicar em staging primeiro
DATABASE_URL_UNPOOLED=<staging> npm --workspace packages/database run db:push

# Validar → aplicar em produção
DATABASE_URL_UNPOOLED=<prod> npm --workspace packages/database run db:push
```

### Regras:
- NUNCA rodar migration direto em produção sem testar em staging
- Migrations são aditivas (não destrutivas) sempre que possível
- Cada migration tem script de rollback documentado
- Migrations são versionadas no git (`packages/database/migrations/`)

---

## 17. COMO EVITAR COMMIT DE SEGREDOS

### Ferramentas:
1. **`.gitignore`** — já configurado para `.env`, `.env.local`, `.env.production`
2. **Pre-commit hook** — `npx lefthook` ou `husky` + `secretlint`
3. **GitHub Push Protection** — ativado no repositório (detecta secrets conhecidos)
4. **`.env.example`** — documenta TODAS as variáveis sem valores reais

### Arquivo `.gitignore` atual (verificar):
```
node_modules/
dist/
.next/
.env
.env.local
.env.production
.turbo/
coverage/
*.log
.vercel
```

### Recomendação adicional:
```bash
# Adicionar ao .gitignore
*.pem
*.key
credentials.json
service-account.json
```

---

## 18. COMO CONFIGURAR .ENV.EXAMPLE

O arquivo `.env.example` atual (72 linhas) está bem documentado. Recomendações:

1. ✅ Já lista TODAS as variáveis obrigatórias
2. ✅ Já tem placeholders com formato correto (ex: `sk_live_xxx`)
3. ✅ Já tem comentários explicando cada grupo
4. ⚠️ Adicionar seção "Como gerar" no topo:

```bash
# ═══════════════════════════════════════════════════════════
# COMO CONFIGURAR:
#   1. cp .env.example .env
#   2. Preencha os valores conforme instruções abaixo
#   3. NUNCA commite .env
#   4. Em produção (VPS): copie para /opt/lembrymed/.env
# ═══════════════════════════════════════════════════════════
```

---

## 19. COMO DOCUMENTAR DEPLOY PARA HUMANO NÃO TÉCNICO

### README_DEPLOY.md (a ser criado em Fase 6):

Estrutura sugerida:

```markdown
# Como colocar o Lembrymed no ar — Guia para Marcus

## Pré-requisitos (o que você precisa ter)
- [ ] Uma VPS contratada (Hetzner, DigitalOcean, etc.)
- [ ] Domínio lembrymed.com.br configurado
- [ ] Acesso ao painel do Neon (banco de dados)
- [ ] Acesso ao painel da Z-API
- [ ] Acesso ao painel do Stripe

## Passo a passo (30 minutos)

### 1. Conectar na VPS
Abra o terminal e digite: ssh root@<ip-da-vps>

### 2. Clonar o projeto
git clone https://github.com/MarcusCarvalho1322/lembrymed.git /opt/lembrymed

### 3. Configurar variáveis
nano /opt/lembrymed/.env
(Cole os valores do .env que eu te enviei por WhatsApp)

### 4. Subir os containers
cd /opt/lembrymed
docker compose -f docker-compose.prod.yml up -d

### 5. Verificar se está no ar
Acesse https://lembrymed.com.br no navegador.

## Se algo der errado
- Me mande uma mensagem com o erro que aparece
- Veja o checklist de emergência em docs/RUNBOOK.md
```

---

## 20. PRÓXIMOS PASSOS (após aprovação deste plano)

1. Criar branch `audit/hermes-centralizacao-infra`
2. Copiar `AUDIT/CI-SUGGESTED.yml` → `.github/workflows/ci.yml`
3. Criar Dockerfiles (web + compose)
4. Criar scripts (backup, deploy, restore)
5. Criar `.github/workflows/deploy.yml`
6. Testar CI no GitHub Actions
7. Validar em staging
8. Deploy em produção
