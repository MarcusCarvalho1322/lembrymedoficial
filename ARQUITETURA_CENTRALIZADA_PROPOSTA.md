# ARQUITETURA CENTRALIZADA — PROPOSTA LEMBRYMED

**Data:** 07/07/2026
**Referência:** Cenário C (Híbrido Estratégico) da MATRIZ_CENTRALIZACAO_CUSTOS.md
**Objetivo:** Propor uma arquitetura de produção mais enxuta, com diagramas Mermaid.

---

## VISÃO GERAL

A arquitetura proposta centraliza toda a computação (API, workers, frontend, Redis) em uma única VPS com Docker Compose, mantendo serviços gerenciados apenas onde são insubstituíveis: banco de dados (Neon), WhatsApp (Z-API), pagamentos (Stripe) e IA (Anthropic Claude).

**Princípios:**
1. Uma VPS = um lugar para gerenciar
2. Docker Compose = infraestrutura como código
3. GitHub Actions = CI/CD automatizado
4. Volumes persistentes = dados não desaparecem em redeploy
5. Caddy = SSL automático sem configuração manual
6. Neon gerenciado = paz de espírito para dados de saúde

---

## 1. ARQUITETURA ATUAL ESTIMADA

```mermaid
graph TB
    subgraph "Usuários"
        P[Paciente WhatsApp]
        F[Familiar WhatsApp]
        A[Admin Browser]
    end

    subgraph "SaaS Externo (4+ plataformas)"
        subgraph "Vercel"
            V_NEXT[Next.js 14<br/>Landing + Admin UI<br/>Checkout Stripe]
        end
        subgraph "Railway"
            R_API[Express API<br/>porta 3000]
            R_WORKERS[6 Workers<br/>BullMQ + node-cron]
            R_REDIS[Redis]
        end
        subgraph "Neon"
            N_DB[(PostgreSQL<br/>Serverless)]
        end
    end

    subgraph "APIs Externas"
        ZAPI[Z-API<br/>WhatsApp]
        STRIPE[Stripe<br/>Pagamentos]
        CLAUDE[Anthropic<br/>Claude API]
    end

    P <-->|mensagens| ZAPI
    F <-->|alertas| ZAPI
    A -->|HTTPS| V_NEXT
    ZAPI -->|webhook| R_API
    ZAPI <-->|envio| R_API
    STRIPE -->|webhook| R_API
    V_NEXT -->|JWT API| R_API
    R_API --> CLAUDE
    R_API --> N_DB
    R_API --> R_REDIS
    R_WORKERS --> R_REDIS
    R_WORKERS --> N_DB
    R_WORKERS --> ZAPI

    style Vercel fill:#000,color:#fff
    style Railway fill:#5C2D91,color:#fff
    style Neon fill:#00E599,color:#000
```

**Problemas desta arquitetura:**
- 4 plataformas para gerenciar (Vercel, Railway, Neon, Z-API)
- Comunicação entre Vercel e Railway adiciona latência (internet pública)
- Custos imprevisíveis (Railway cobra por uso)
- Deploy em 2 lugares diferentes
- Sem ambiente staging isolado
- Logs distribuídos em 3 lugares diferentes

---

## 2. ARQUITETURA CENTRALIZADA PROPOSTA (Cenário C — Híbrido)

```mermaid
graph TB
    subgraph "Usuários"
        P[Paciente WhatsApp]
        F[Familiar WhatsApp]
        A[Admin Browser]
    end

    subgraph "VPS Única (Hetzner/DigitalOcean ~$12-20/mês)"
        subgraph "Caddy (Reverse Proxy)"
            CADDY[Caddy<br/>SSL Auto Let's Encrypt<br/>:443 → containers]
        end

        subgraph "Docker Compose Stack"
            API[API Express<br/>:3000<br/>+ 6 Workers BullMQ]
            WEB[Next.js 14<br/>:3001<br/>Standalone mode]
            REDIS[Redis 7 Alpine<br/>:6379<br/>Volume persistente]
        end

        subgraph "Volumes"
            REDIS_DATA[Redis Data<br/>AOF + RDB]
        end

        subgraph "Scripts"
            BACKUP[backup.sh<br/>pg_dump Neon → S3<br/>cron 3am BRT]
            HEALTH[healthcheck.sh<br/>curl /health<br/>cron 5min]
        end
    end

    subgraph "Serviços Gerenciados (mantidos)"
        NEON[(Neon PostgreSQL<br/>Gerenciado<br/>Backups + Branching)]
    end

    subgraph "APIs Externas (mantidas)"
        ZAPI[Z-API WhatsApp]
        STRIPE[Stripe Pagamentos]
        CLAUDE[Anthropic Claude]
        S3[AWS S3 / Backblaze B2<br/>Backups offsite]
    end

    subgraph "CI/CD"
        GH[GitHub Actions<br/>CI: typecheck+build+test<br/>CD: SSH deploy]
    end

    P <-->|mensagens| ZAPI
    F <-->|alertas| ZAPI
    A -->|HTTPS :443| CADDY
    CADDY -->|/api/*| API
    CADDY -->|/*| WEB
    ZAPI -->|webhook| CADDY
    STRIPE -->|webhook| CADDY
    API --> CLAUDE
    API --> NEON
    API --> REDIS
    WEB -->|JWT| API
    GH -->|git push| GH
    GH -->|SSH deploy| CADDY
    BACKUP --> NEON
    BACKUP --> S3

    style CADDY fill:#00BFA5,color:#fff
    style API fill:#5C2D91,color:#fff
    style WEB fill:#000,color:#fff
    style REDIS fill:#DC382D,color:#fff
    style NEON fill:#00E599,color:#000
    style S3 fill:#FF9900,color:#000
```

**Benefícios:**
- 1 lugar para gerenciar (VPS) em vez de 3 (Railway + Vercel + Neon)
- Comunicação interna via rede Docker (latência zero entre API e Web)
- SSL automático via Caddy (Let's Encrypt)
- Custo previsível (~$12-20/mês VPS + $19 Neon + $10 Z-API = ~$41-49)
- Deploy unificado via GitHub Actions
- Backups automatizados com offsite (S3)
- Healthcheck e monitoramento centralizados

---

## 3. FLUXO DE DEPLOY VIA GITHUB

```mermaid
sequenceDiagram
    participant Dev as Dev (Marcus)
    participant GH as GitHub
    participant CI as GitHub Actions CI
    participant CD as GitHub Actions CD
    participant VPS as VPS (Docker Compose)
    participant Neon as Neon DB

    Dev->>GH: git push (feature branch)
    Dev->>GH: Open Pull Request → main

    GH->>CI: Trigger CI on PR
    CI->>CI: npm ci
    CI->>CI: Typecheck API (tsc --noEmit)
    CI->>CI: Build Web (next build)
    CI->>CI: Test API (vitest)
    CI-->>GH: ✅ All checks pass

    Dev->>GH: Merge PR (squash)

    GH->>CD: Trigger CD on push to main
    CD->>VPS: SSH into server
    CD->>VPS: git pull origin main
    CD->>VPS: docker compose -f prod.yml build
    CD->>VPS: docker compose -f prod.yml up -d

    VPS->>VPS: Healthcheck (curl /health)
    VPS-->>CD: ✅ Deploy OK

    Note over Dev,Neon: Migrations são manuais (segurança)
    Dev->>Neon: drizzle-kit push (staging branch)
    Dev->>Neon: Validar staging
    Dev->>Neon: drizzle-kit push (main/production)
```

---

## 4. FLUXO DE DADOS (LEMBRETE)

```mermaid
sequenceDiagram
    participant S as Scheduler (1/min)
    participant R as Redis Cache
    participant Q as BullMQ Queue
    participant W as Sender Worker
    participant DB as Neon DB
    participant Z as Z-API
    participant P as Paciente WhatsApp

    Note over S,R: Steady-state: zero queries ao Neon

    S->>R: getActiveMeds() via Redis cache
    R-->>S: Lista de medicamentos ativos
    S->>S: Calcular janela (BRT): T-10, T=0, T+10
    S->>R: Verificar dedup (já enviou hoje?)
    R-->>S: Não enviado → prossegue
    S->>Q: Enfileirar send-reminder (jobId determinístico)
    Q->>W: Processar job
    W->>Z: Enviar mensagem WhatsApp
    Z-->>W: OK (messageId)
    W->>R: Marcar dedup (evita reenvio)
    W->>DB: Gravar reminder_logs (scheduled_for, status=sent)
    W->>Q: Agendar family-alert (delay 30min)

    Note over P: 30 min depois...

    Q->>W: Processar family-alert
    W->>DB: Checar medication_confirmations
    alt Paciente confirmou (SIM)
        W->>W: Cancelar alerta silenciosamente
    else Paciente NÃO confirmou
        W->>DB: Checar dedup familiar (1/dia)
        DB-->>W: Não alertado hoje → prossegue
        W->>Z: Enviar alerta para familiar
        W->>DB: Gravar family_alert_logs
    end
```

---

## 5. FLUXO DE ROLLBACK

```mermaid
flowchart TD
    A[Deploy quebrou algo?] -->|Sim| B{Qual a causa?}
    B -->|Código| C[Rollback de código]
    B -->|Migration| D[Rollback de migration]
    B -->|Config| E[Rollback de env vars]

    C --> C1[SSH na VPS]
    C1 --> C2[git log --oneline -5]
    C2 --> C3[git revert OU git reset --hard para commit estável]
    C3 --> C4[docker compose up -d --build]
    C4 --> C5[curl /health → verificar OK]

    D --> D1[Neon Dashboard → Branches]
    D1 --> D2{Restaurar snapshot?}
    D2 -->|Sim| D3[Restore branch para antes da migration]
    D2 -->|Não| D4[Criar migration reversa manual]
    D4 --> D5[Aplicar migration reversa em preview]
    D5 --> D6[Promover para main]

    E --> E1[Editar .env na VPS]
    E1 --> E2[docker compose down]
    E2 --> E3[docker compose up -d]

    C5 --> F{Smoke test OK?}
    D6 --> F
    E3 --> F
    F -->|Sim| G[✅ Rollback concluído]
    F -->|Não| H[🚨 Escalar para dev examinar]
```

---

## 6. FLUXO DE BACKUP

```mermaid
flowchart TD
    subgraph "Backup Automático (cron 3:00 AM BRT)"
        A[Cron dispara backup.sh]
        A --> B[pg_dump Neon → /data/backups/lembrymed_TIMESTAMP.dump]
        B --> C{pg_dump OK?}
        C -->|Sim| D[Compactar .dump (gzip)]
        C -->|Não| E[Notificar ADMIN_WHATSAPP<br/>'🚨 Backup falhou']
        D --> F[Sincronizar com S3/B2 via rclone]
        F --> G{Limpeza: backups > 30 dias?}
        G -->|Sim| H[Deletar backups antigos locais]
        G -->|Não| I[Manter]
        H --> J[✅ Backup concluído. Log em /var/log/backup.log]
        I --> J
    end

    subgraph "Teste de Restore (mensal, manual)"
        K[1º dia do mês: testar restore]
        K --> L[Baixar último .dump do S3]
        L --> M[pg_restore em banco staging Neon]
        M --> N[Rodar smoke test no staging]
        N --> O{Staging funciona?}
        O -->|Sim| P[✅ Backup validado]
        O -->|Não| Q[🚨 Investigar backup corrompido]
    end
```

---

## COMPONENTES DA ARQUITETURA PROPOSTA

### Aplicação Frontend (Next.js)
- **Container:** `node:20-slim` + Next.js standalone build
- **Porta:** 3001 (interna)
- **Build:** `next build` (SSG landing + admin SPA)
- **Dependências:** Stripe SDK (checkout), framer-motion
- **Conexão externa:** → API interna (`http://api:3000`)

### Aplicação Backend (Express)
- **Container:** `node:20-slim` + esbuild bundle
- **Porta:** 3000 (interna)
- **Workers:** 6 workers BullMQ + node-cron no mesmo container (aceitável para volume atual)
- **Dependências:** ioredis, bullmq, @neondatabase/serverless, stripe, @anthropic-ai/sdk, bcryptjs, jsonwebtoken, zod, winston
- **Conexão externa:** → Neon (DATABASE_URL), Redis (redis:6379), Z-API, Stripe, Anthropic

### Redis
- **Container:** `redis:7-alpine`
- **Porta:** 6379 (interna, sem exposição externa)
- **Persistência:** AOF + RDB em volume Docker
- **Uso:** BullMQ backend, cache de saúde, dedup de webhook, med-schedule-cache

### Reverse Proxy (Caddy)
- **Container:** `caddy:2-alpine`
- **Portas:** 80 → 443 (SSL automático)
- **Roteamento:**
  - `/api/*` → API (3000)
  - `/webhook/*` → API (3000)
  - `/health` → API (3000)
  - `/metrics` → API (3000)
  - `/*` → Web (3001)

### Banco de Dados (Neon — gerenciado)
- **Provider:** Neon PostgreSQL Serverless
- **Plano:** Launch ($19/mês, 300 CU-horas)
- **Conexão:** DATABASE_URL (pooled, HTTP) via @neondatabase/serverless
- **Backup:** pg_dump agendado → S3

### CI/CD (GitHub Actions)
- **CI:** typecheck + build + test em cada PR
- **CD:** SSH deploy em push para main
- **Secrets:** GitHub Secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY)

### Monitoramento
- **Healthcheck:** `GET /health` (Redis + DB status)
- **Métricas:** `GET /metrics` (filas, entregas, uptime)
- **Alertas:** Worker `zapi-health` (Z-API status via WhatsApp)
- **Logs:** Winston → stdout → Docker json-file driver

### Domínios
- `lembrymed.com.br` → Landing + Admin (Caddy → web:3001)
- `api.lembrymed.com.br` → API (Caddy → api:3000) — opcional, pode usar path-based
- SSL: Let's Encrypt via Caddy (renovação automática)

---

## ESTIMATIVA DE RECURSOS DA VPS

| Serviço | RAM | CPU | Disco |
|---------|-----|-----|-------|
| Caddy | 50MB | 0.1 | — |
| API + Workers | 256-512MB | 0.5-1.0 | — |
| Web (Next.js) | 128-256MB | 0.3-0.5 | — |
| Redis | 128-256MB | 0.2 | 5GB (volume) |
| Sistema + folga | 512MB | — | 10GB |
| **Total recomendado** | **2-4GB** | **2 vCPU** | **40-80GB SSD** |

---

## PRÓXIMOS PASSOS

1. Criar `docker-compose.yml` (dev local com Postgres + Redis)
2. Criar `docker-compose.prod.yml` (produção na VPS)
3. Criar `Caddyfile`
4. Criar Dockerfile para web (Next.js standalone)
5. Criar `.github/workflows/deploy.yml`
6. Criar scripts (backup, healthcheck, restore)
7. Testar stack completa localmente
8. Provisionar VPS e testar staging
9. Migrar produção
