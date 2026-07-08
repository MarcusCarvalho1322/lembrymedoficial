# CHANGELOG

Todas as mudanças relevantes do Lembrymed. Formato baseado em [Keep a Changelog](https://keepachangelog.com/).

---

## [v2.10-audit] — 2026-04-22

### 🔒 Security (Crítico)
- **Removido fallback inseguro** `'dev-secret-change-me'` em `NEXTAUTH_SECRET` — agora obrigatório em qualquer ambiente.
- **Rate limit** no `/admin/login` (5 tentativas / 15 min por IP + email).
- **Webhook Z-API fail-closed em produção** — requer `ZAPI_WEBHOOK_TOKEN`; comparação em tempo constante via `timingSafeEqual`.
- **Webhook Stripe com idempotência** via Redis SET NX TTL 24h no `event.id`.
- **Security headers** aplicados globalmente (HSTS, X-Frame-Options, nosniff, Referrer-Policy).
- **CORS** restritivo — whitelist explícita de origens.
- **`env.ts`** importado no boot (antes era órfão; validação não rodava).

### 📜 LGPD
- Tabelas novas: `consent_logs`, `privacy_policies`, `admin_audit_logs`.
- Páginas `/privacidade` e `/termos` publicadas.
- Checkbox de consentimento obrigatório no checkout + registro com IP/user-agent/versão.
- Palavras-chave WhatsApp para pedidos LGPD: `EXPORTAR MEUS DADOS` / `EXCLUIR MEUS DADOS`.
- Audit log middleware em todas as rotas admin sensíveis.
- Retention automática de `message_logs.content > 90 dias` (anonimização).

### 🗃️ Banco de dados
- FKs de `reminder_logs`, `medication_confirmations`, `message_logs`, `family_alert_logs` agora com `ON DELETE CASCADE` ou `SET NULL` — habilita `DELETE /admin/patients/:id`.
- Índice composto `idx_family_alerts_dedup` para a query quente de dedup diária.
- Migration `0002_cascade_and_lgpd_tables.sql` disponível (aplicar em produção após deploy).

### ⏱️ Confiabilidade
- **Lifecycle worker** agora calcula "faltam N dias" em BRT (corrige bug de 1 dia errado perto da meia-noite).
- **Scheduler de lembretes** usa `jobId` determinístico → dedup BullMQ gratuita.
- `reminder_logs.scheduled_for` agora reflete horário PLANEJADO (não momento do envio) — métricas de SLA voltam a fazer sentido.
- `handleConfirmation` confirma TODOS os medicamentos do último bloco de horário (antes era só 1 com LIMIT 1).
- Worker `zapi-health` novo — alerta admin via WhatsApp se Z-API desconectar.
- Retentar falhas silenciosas via `.catch(() => {})` substituídas por `.catch(warn)`.

### 🧪 Validação
- Zod no `PATCH /admin/patients/:id` — body validado com regex de telefone BR.
- Zod no `/api/checkout` — tamanho de nome, formato de email, validação de phone.
- `validateFamilyPhone` no telefone extraído pelo Claude (impede persistir número aleatório).

### 🎨 UX / Acessibilidade
- Modal do checkout com `role="dialog"`, `aria-modal`, Esc fecha, autoComplete + inputMode corretos.
- Variável CSS `--hint` ajustada para contraste WCAG AA (`#6B7280`).
- Fontes carregadas via `next/font/google` (auto-hosting, preload, sem CLS) — DM Sans, Playfair Display, Cinzel, Cormorant Garamond.
- OG + Twitter cards completos + metadata viewport explícito.
- Página `/success` com banner de suporte + links legais.
- `/checkout` agora redireciona para landing (elimina duplicação de form).

### 🔧 DevEx
- Lockfile regenerado — fixa `tsx@4.19.4` para evitar `esbuild@0.27.7` fantasma.
- Override `esbuild@0.25.8` no package.json raiz.
- Scripts `typecheck` e `test` em ambos os apps.
- `dev` monolítico via `turbo dev`.
- GitHub Actions CI (`typecheck + build + test`).
- Vitest 1.6 com 27 testes unitários (phone helpers + privacy helpers).
- Sentry opcional via dynamic import (zero custo se `SENTRY_DSN` não definido).
- `maskPhone/maskEmail/maskCpf/maskName` helpers em `packages/shared/privacy.ts`.

### 🧹 Limpeza
- Removido `apps/api/src/_legacy/` (~500 linhas Managed Agents descontinuado).
- Removido `scripts/setup-agents.ts` (imports quebrados referenciavam `_legacy`).
- `.env.example` reescrito refletindo apenas a stack Z-API real (remove docs obsoletas 360dialog/Managed Agents).

### 📖 Docs
- README totalmente reescrito.
- `docs/ARQUITETURA.md`, `docs/FLUXOS-CRITICOS.md`, `docs/LGPD.md`, `docs/RUNBOOK.md`, `docs/ROADMAP.md`.
- Relatórios de auditoria em `AUDIT/` (00-sumario, 01-reconhecimento, 02-diagnostico, 03-execucao-log, 04-gaps, 05-ux-landing, 06-hardening, RISCOS-RESIDUAIS).

### Breaking changes
⚠️ **Antes de deployar esta versão, configure:**
- `NEXTAUTH_SECRET` (mínimo 32 chars) — sem fallback
- `ZAPI_WEBHOOK_TOKEN` (mínimo 16 chars) — obrigatório em produção
- `NODE_ENV=production`
- (Opcional) `ADMIN_WHATSAPP`, `SENTRY_DSN`

O app agora faz **fail-fast** no boot se envs obrigatórias estiverem ausentes.

---

## Versões anteriores (histórico git)

Commits anteriores mantidos em `git log`:

- `953a393 feat: v2.9-hardening completo — Fix #1-7, workers BullMQ, admin BIZZ.IA, webhook Z-API direto`
- `3b2f0fe feat: relatório mensal de adesão via WhatsApp`
- `e236bc5 feat: dedup alerta familiar (1/dia) + check-in paciente reincidente`
- `f294748 fix: alerta de abandono onboarding vai apenas para o familiar do paciente`
- `958175c v2.9.1 — 3 melhorias: PATCH admin/patients, alerta abandono WhatsApp, timezone BRT`
- ...
