# Onda 4 — Gaps Estruturais Implementados

**Data:** 2026-04-22
**Branch:** `fix/onda-3-hardening-seguranca` (reutilizada — todos os commits abaixo estão nela)

---

## Entregues

### LGPD compliance

| Gap | Status | Entregável |
|---|---|---|
| Política de Privacidade pública | ✅ | [`/privacidade`](apps/web/app/privacidade/page.tsx) — v1.0 vigente desde 2026-04-22 |
| Termos de Uso públicos | ✅ | [`/termos`](apps/web/app/termos/page.tsx) |
| Registro de consentimento | ✅ (Onda 3) | tabela `consent_logs` + captura no checkout |
| Canal paciente `EXPORTAR/EXCLUIR MEUS DADOS` | ✅ (Onda 3) | handlers no webhook WhatsApp |
| Audit log admin | ✅ (Onda 3) | middleware `auditAdminAccess` + tabela `admin_audit_logs` |
| Retention de `message_logs.content` | ✅ (Onda 3) | 90 dias no lifecycle worker |
| Versionamento de política | ✅ (Onda 3) | tabela `privacy_policies` |

### Observabilidade

| Gap | Status | Entregável |
|---|---|---|
| Sentry opcional | ✅ | `apps/api/src/config/sentry.ts` — dynamic import, no-op se DSN ausente |
| Healthcheck Z-API | ✅ (Onda 3) | worker `zapi-health.worker.ts` |
| Alerta em unhandledRejection/uncaughtException | ✅ | `captureException` no `index.ts` |

### Qualidade/testes

| Gap | Status | Entregável |
|---|---|---|
| Framework de testes | ✅ | vitest 1.6 com config em `apps/api/vitest.config.ts` |
| Testes unitários | ✅ | 27 testes, 100% passando |
| CI | ✅ (Onda 3 + 4) | `.github/workflows/ci.yml` — typecheck + build + test |
| `useAuth()` fail-fast | ✅ (Onda 3) | `apps/web/lib/auth-context.tsx` |
| Extração de funções puras | ✅ | `apps/api/src/lib/phone.ts` |

---

## Não entregues (escopo Onda 5/6/7 ou APROVAR)

### Aguardando decisão de Marcus (ver RISCOS-RESIDUAIS.md)

- **Item 07** — canal alternativo (SMS/email/2ª instância Z-API) quando provedor principal falha. Precisa decisão de custo.
- **Item 08** — workers em service Railway separado (~15-20 USD/mês).
- **Item 10 (parte)** — JWT admin em cookie HttpOnly (mudança coordenada frontend+backend).
- **Item 30 (parte)** — endpoint `/public/onboarding-status`.
- **Item 48** — imagens grandes na raiz do repo.

### Ficam na Onda 5 (UX + landing)

- **Item 29** — split do componente `LembrymedLanding` (532 linhas) — feito parcialmente; mas a quebra em subcomponentes fica melhor na Onda 5.
- **Item 35** — `next/font/google` substitui `@import url(...)`.
- **Item 37/38** — limpeza TS `any` + landing splitting.

### Ficam na Onda 6 (hardening final)

- Checklist OWASP ASVS completo.
- Pen-test manual (IDOR, CSRF, webhook forjado).

### Ficam na Onda 7 (documentação)

- **Item 46** — reescrever `README.md` e `docs/`.
- `docs/ARQUITETURA.md`, `docs/FLUXOS-CRITICOS.md`, `docs/LGPD.md`, `docs/RUNBOOK.md`, `docs/ROADMAP.md`.
- `CHANGELOG.md`.

---

## Build local — status

```bash
# API typecheck
cd apps/api && npx tsc --noEmit          # EXIT=0 ✓

# Web build
cd apps/web && npm run build               # ✓ gera 12 páginas

# Tests
cd apps/api && npm test                    # 27/27 ✓

# API esbuild bundle
./node_modules/.bin/esbuild apps/api/src/index.ts --bundle ...  # 3.5MB ✓
```

Tudo verde. Pronto para merge quando Marcus aprovar.
