# Onda 3 — Log de Execução

Branch: `fix/onda-3-hardening-seguranca`
Iniciado em: 2026-04-22

Cada entrada: **item #**, descrição, arquivos, commit, verificação.

---

## Bloqueios conhecidos antes da execução

- **BLOCKER-INSTALL:** `npm install` quebra por (a) OneDrive EPERM e (b) `esbuild@0.27.7` inexistente no registry (via tsx@4.21.0 no lockfile). Preciso consertar o lockfile ANTES de qualquer outra coisa (item 21). Todo o resto é análise estática + edição — build/test completos ficam restritos até o lockfile estar saudável.

---

## Item 21 — lockfile saudável ✅

**O que foi feito:**
- `apps/api/package.json`: pin `"tsx": "4.19.4"` (de `^4.15.0`) — versão cujo `esbuild` transitivo é `~0.25.0` (existe no registry).
- `package.json` raiz: adicionado `"overrides": { "esbuild": "0.25.8" }` como trava de segurança contra futuras transitivas fantasmas.
- `package-lock.json` regenerado via `npm install --package-lock-only` — agora trava esbuild em `0.21.5` (direta) + `0.25.8` (via override) e tsx em `4.19.4`. Nenhuma referência a `0.27.7`.

**Verificação:**
```
npm install --package-lock-only → up to date in 51s (sem erro de ETARGET)
grep '"node_modules/esbuild"' package-lock.json → 0.21.5 ✓
grep '"node_modules/tsx"' package-lock.json → 4.19.4 ✓
```

**Commit alvo:** `chore(deps): regenerar lockfile + remover código legacy` (6b69040)

---

## Itens corrigidos até agora — Onda 3

| # | Título                                         | Commit   | Arquivo(s)                                                                    |
|---|------------------------------------------------|----------|-------------------------------------------------------------------------------|
| 21| Lockfile com esbuild fantasma                  | 6b69040  | `package.json`, `package-lock.json`, `apps/api/package.json`, `turbo.json`    |
| 23| `scripts/setup-agents.ts` quebrado             | 6b69040  | delete                                                                         |
| 24| `apps/api/src/_legacy/`                        | 6b69040  | delete                                                                         |
| 47| Script `dev` monolítico                        | 6b69040  | `package.json`, `turbo.json`                                                  |
| 03| FKs sem CASCADE                                | 46b6264  | `packages/database/schema.ts`, `migrations/0002_...sql`                       |
| 09| Consentimento LGPD + privacy_policies         | 46b6264 + e9c7f0b | schema + migration + modal checkbox                                    |
| 32| admin_audit_logs                               | 46b6264  | schema + migration + middleware + aplicado em patients routes                 |
| 50| Versionamento de políticas (privacy_policies)  | 46b6264  | schema + migration                                                             |
| 01| `NEXTAUTH_SECRET` obrigatório                  | 4e4013c  | `apps/api/src/middleware/auth.ts` + `config/env.ts`                           |
| 02| Webhook Z-API fail-closed em produção          | 4e4013c  | `apps/api/src/routes/webhooks/whatsapp.ts`                                    |
| 04| Rate limit no /admin/login                     | 4e4013c  | `apps/api/src/middleware/rateLimit.ts` + aplicado em auth.ts                  |
| 05| `env.ts` importado no boot (fail-fast)         | 4e4013c  | `apps/api/src/index.ts` (1º import) + `config/env.ts` reescrito               |
| 11| CORS restritivo                                | 4e4013c  | `apps/api/src/index.ts`                                                       |
| 12| Security headers (HSTS/X-Frame/etc.)           | 4e4013c  | `apps/api/src/middleware/securityHeaders.ts`                                  |
| 22| `.env.example` limpo                           | 4e4013c  | `.env.example`                                                                 |
| 40| Idempotência webhook Stripe                    | 4e4013c  | `apps/api/src/routes/webhooks/stripe.ts`                                      |
| 06| Timezone BRT em lifecycle worker               | 86bceaf  | `apps/api/src/workers/lifecycle.worker.ts`                                    |
| 16| jobId dedup no scheduler                       | 86bceaf  | `apps/api/src/workers/reminder-scheduler.worker.ts`                           |
| 18| `scheduled_for` com semântica correta          | 86bceaf  | `reminder-scheduler.worker.ts` + `reminder-sender.worker.ts` + `types.ts`     |
| 13| Zod validation em PATCH /admin/patients        | 99c1ad8  | `apps/api/src/routes/admin/patients.ts`                                       |
| 14| Validação de telefone extraído Claude          | (parcial: em whatsapp.ts) | função `validateFamilyPhone`                                     |
| 17| handleConfirmation multi-med                   | (em whatsapp.ts; sem commit separado — agrupado com 14) | multi-med no mesmo bloco de horário  |
| 19| Modal acessibilidade (role/aria/esc)           | e9c7f0b  | `LembrymedLanding.tsx`                                                        |
| 20| Contraste AA (var --hint)                      | e9c7f0b  | `LembrymedLanding.tsx`                                                        |
| 28| Zod validation no /api/checkout                | e9c7f0b  | `apps/web/app/api/checkout/route.ts`                                          |
| 36| Meta viewport/OG                               | e9c7f0b  | `apps/web/app/layout.tsx`                                                     |
| 39| useAuth() throw fora do Provider               | e9c7f0b  | `apps/web/lib/auth-context.tsx`                                               |
| 41| Fonte OMS verificável na landing               | e9c7f0b  | `LembrymedLanding.tsx`                                                        |
| 45| Consent flow no checkout + webhook             | e9c7f0b + 4e4013c | checkout route + stripe webhook                                       |
| 33| `.catch(() => {})` substituído por warn logs   | 4e4013c (em whatsapp.ts) | parcial — cobre os logs de outbound/inbound                       |
| 31| Canal paciente solicitar export/delete         | (pendente — Onda 4)        | Proposta: palavra-chave WhatsApp                                |

## Itens ainda pendentes (Onda 4/5/6) — autônomos mas maiores

- **15** Retention/truncamento de `message_logs.content` — job noturno no lifecycle.worker.ts
- **25** Healthcheck Z-API (worker `zapi-health`)
- **26** Sentry (instalação + DSN opcional)
- **27** Helper `maskPII()` no logger
- **29** Consolidar `/checkout` page + modal (refatoração UX)
- **30** Banner "se em 5 min não receber..." em /success
- **34** Refactor query de /admin/patients com LEFT JOIN
- **35** `next/font/google` substitui @import
- **37, 38** TS cleanup + landing splitting (Onda 5)
- **42** Test framework (Onda 4)
- **43** Ordem `buildPhoneCandidates` documentada
- **46** Atualizar `README.md` e `docs/` (Onda 7)
- **49** GitHub Actions CI (Onda 4)

## Itens que viraram **APROVAR** (ficam em `AUDIT/RISCOS-RESIDUAIS.md`)

- **07** Fallback crítico (qual canal alternativo? SMS/Resend/etc.)
- **08** Separar workers em service Railway distinto
- **10** JWT em cookie HttpOnly (mudança frontend admin)
- **30** (parte) Endpoint público `/public/onboarding-status`
- **34** (parte) Rodar migration de índices em Neon produção
- **48** Confirmar se imagens grandes da raiz são referência ou lixo


