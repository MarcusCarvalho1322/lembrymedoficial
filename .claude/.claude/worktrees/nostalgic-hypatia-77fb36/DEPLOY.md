# DEPLOY — Passo a passo para aplicar a auditoria em produção

**Situação atual (22/04/2026):**
- Branch `fix/onda-3-hardening-seguranca` pronta, [PR #4](https://github.com/MarcusCarvalho1322/lembrymed/pull/4)
- 12 commits, build + typecheck + 27 testes verdes
- Railway: já logado no CLI local como `Marcuscc`, projeto `lembrymed`, serviço `lembrymed-api`, env `production`
- Vercel: CLI logado em team "marcus cardoso carvalho's projects" (mas o deploy atual pode estar em outro team)
- Neon: sem CLI; vamos aplicar via comando `drizzle-kit` que já usa a `DATABASE_URL_UNPOOLED` do Railway

---

## Legenda

- 🤖 **auto-Claude** — comando que Claude executa autonomamente
- 👤 **você** — precisa de interação humana (login painel, QR code, copy-paste)
- 🔒 **bloqueante** — precisa acontecer antes do merge do PR
- 💤 **opcional** — pode ser deixado para depois

---

## Pre-flight

### ⚠️ Antes de qualquer coisa: rotacionar secret exposto

Durante o mapeamento, o comando `railway variables` imprimiu os valores reais no terminal (NEXTAUTH_SECRET, ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL, ADMIN_PASSWORD_HASH parcial). Esses valores ficaram no transcript local do Claude Code.

**Ação recomendada (👤):** rotacionar `NEXTAUTH_SECRET` depois do deploy (impacto: você é deslogado do admin, refaz login). Outros secrets (Anthropic, Neon, Redis) opcional — rotacionar só se o transcript for compartilhado.

---

## Ordem de execução

### Passo 1 — 🤖 Gerar os novos tokens localmente 🔒

Gera valores fortes, **sem escrever em arquivo** (só em memória do terminal) e salva em variáveis shell para o passo 2.

```bash
NEW_NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEW_ZAPI_WEBHOOK_TOKEN=$(openssl rand -hex 24)
```

### Passo 2 — 🤖 Configurar as envs novas no Railway 🔒

```bash
railway variables --set "ZAPI_WEBHOOK_TOKEN=$NEW_ZAPI_WEBHOOK_TOKEN"
# opcionais
railway variables --set "ADMIN_WHATSAPP=5565XXXXXXXXX"   # SEU número com 55+DDD
railway variables --set "SENTRY_DSN=https://..."         # se usar Sentry
```

> Nota: `NEXTAUTH_SECRET` já tem valor forte (44 chars base64). Não vou substituir automaticamente — deixo para você decidir se quer rotacionar agora pelo motivo do transcript.

### Passo 3 — 👤 Configurar o mesmo token no painel Z-API 🔒

Não tenho acesso ao z-api.io pelo CLI. Você precisa:

1. Entre em https://z-api.io → sua instância → **Settings** → **Webhook Security Token**
2. Cole o valor de `$NEW_ZAPI_WEBHOOK_TOKEN` (peço para você no terminal antes de apagar)
3. Salve

### Passo 4 — 🤖 Merge do PR #4

```bash
gh pr merge 4 --squash --delete-branch
```

### Passo 5 — 🤖 Rodar migration 0002 no Neon 🔒

Antes de reiniciar a API Railway (que roda o código novo), aplicar a migration para que as novas tabelas + CASCADEs existam.

```bash
# Via drizzle-kit push (prefere schema atual — já inclui CASCADE + tabelas LGPD)
npm --workspace packages/database run db:push

# OU via psql direto (se instalarmos psql):
psql "$DATABASE_URL_UNPOOLED" -f packages/database/migrations/0002_cascade_and_lgpd_tables.sql
```

Como alternativa segura, recomendo aplicar em branch Neon preview primeiro. Sem neonctl, a forma mais simples é pelo painel Neon UI → "Branches" → "New Branch".

### Passo 6 — 🤖 Redeploy Railway

```bash
railway up --detach
# acompanhar:
railway logs --deployment
```

### Passo 7 — 🤖 Verificar que a API subiu OK

```bash
curl -fsS https://lembrymed-api-production.up.railway.app/health | head
# esperado: {"status":"ok","redis":"connected","version":"v2.9-hardening",...}
# depois do deploy v2.10, o campo version não muda (não atualizei em health.ts — item trivial que posso fazer)
```

### Passo 8 — 💤 Deploy Vercel

Como o Vercel tem integração com GitHub, ao merge do PR ele deploya sozinho (se o webhook Vercel→GitHub estiver ativo). Para forçar:

```bash
# Se vercel CLI estiver logado no team certo:
cd apps/web && vercel --prod
```

Se o Vercel estiver em outro team, acesse o dashboard manualmente e puxe o commit novo.

### Passo 9 — 👤 Smoke test

1. Abra `https://lembrymed.com.br` (ou o domínio real) → Landing carrega → modal abre com checkbox LGPD
2. Teste `/privacidade` e `/termos` — páginas visíveis
3. Login no admin → dashboard carrega
4. Envie "oi" de um WhatsApp de teste para o número Lembrymed → o bot responde ou você vê a mensagem em `/admin/patient/<phone>`

---

## Rollback (se algo der errado)

```bash
# Voltar para o commit anterior em Railway (deploy Railway UI -> rollback ou):
railway rollback

# Reverter merge no GitHub:
gh pr revert 4
```

A migration 0002 é aditiva (só adiciona CASCADE e cria tabelas novas). Rollback dela requer DROP manual — veja `packages/database/migrations/0002_cascade_and_lgpd_tables.sql` para reverter em ordem.
