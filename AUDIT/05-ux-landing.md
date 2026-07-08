# Onda 5 — Melhorias de UX e Landing

## Sumário de mudanças aplicadas

### Landing (`apps/web/components/landing/LembrymedLanding.tsx`)

| Item | Antes | Depois |
|---|---|---|
| Fontes | `@import url(fonts.googleapis.com)` bloqueante dentro de `<style>` | next/font/google auto-hospedado com `display: swap` |
| Contraste (`--hint`) | `#9CA3AF` (ratio 2.6:1 ❌ AA) | `#6B7280` (ratio 4.85:1 ✅ AA) |
| Modal de checkout | Sem role/aria | `role="dialog"`, `aria-modal`, `aria-labelledby`, Esc fecha |
| Inputs do modal | Sem `autoComplete`, sem `required`, sem `inputMode` | `autoComplete=name/email/tel`, `inputMode=email/tel`, `required` |
| Consentimento LGPD | Inexistente | Checkbox obrigatório com links para `/privacidade` e `/termos` |
| Estatística OMS | Fonte genérica "OMS/Fiocruz" sem link | Link para paper oficial WHO Adherence 2003 |
| Query string `?checkout=1` | Sem handler | Abre modal automático (consolida com `/checkout` page) |

### Checkout (`apps/web/app/checkout/page.tsx`)

- Antes: página standalone com form duplicado (alert() em erro). Duas surfaces de checkout para Marcus manter em sync.
- Depois: redirect para `/?checkout=1` em `<Suspense>`. Uma única surface.

### Success (`apps/web/app/success/page.tsx`)

| Item | Antes | Depois |
|---|---|---|
| Fallback "webhook demorou" | Sem orientação se WhatsApp não chegasse | Banner `role="status"` explícito com link suporte |
| Links legais | Ausentes | `/privacidade` + `/termos` no footer |
| Semantica | `<div>` wrapper | `<main>`, `aria-hidden` em emojis |
| Contraste | `--sub: #4B5563` (ok), `#9CA3AF` hint (ruim) | `#374151` / `#6B7280` AA ok |

### Layout (`apps/web/app/layout.tsx`)

- `viewport` export explícito com `initialScale: 1`, `maximumScale: 5`, `themeColor: #1A5632`
- OG + Twitter card completos com imagem de preview
- `metadataBase` absoluta
- 4 fontes next/font com CSS vars (`--font-dm-sans`, `--font-playfair`, `--font-cinzel`, `--font-cormorant`)

### Admin layout (`apps/web/app/admin/layout.tsx`)

- `useAuth()` agora throw fora do Provider → previne bugs de "token null silent"

### Páginas novas
- `/privacidade` — Política de Privacidade LGPD completa
- `/termos` — Termos de Uso

---

## Lighthouse / Core Web Vitals — estimativa

**Ressalva importante:** **NÃO RODEI Lighthouse em produção** durante esta auditoria (ambiente local sem Chrome headless configurado + sem deploy preview disponível). Os números abaixo são **estimativas fundamentadas no perfil de mudança**, não medidas empíricas.

| Métrica | Antes (estimativa) | Depois (estimativa) | Motivo |
|---|---|---|---|
| LCP | ~2.8 s | ~1.8 s | `@import` de fonte remota é bloqueante; next/font preload + `display: swap` |
| CLS | 0.10+ | ~0.02 | Swap de fonte deixa de reflow |
| TBT | médio | baixo | Menos JS para carregar fonte externa |
| Accessibility | ~78 | ~95 | role=dialog + autocomplete + contraste |
| SEO | ~85 | ~98 | OG cards completos + robots + canonical |

**Ação pendente Onda 5 → Marcus:** rodar `lighthouse https://lembrymed.com.br --preset=desktop` e `--preset=mobile` após deploy desta branch em preview Vercel e colar resultado real em `AUDIT/05-ux-landing.md`. Se alguma métrica não bater, ajustar.

---

## Pendências conscientemente adiadas

- **Split do `LembrymedLanding` em subcomponentes** (`<Hero>`, `<Stats>`, `<Steps>`, `<FAQ>`, etc). O arquivo tem 550+ linhas. Não quebra nada, mas dificulta manutenção. Fica para uma PR de refactor dedicada que Marcus aprove depois.
- **Testes E2E (Playwright)** — esperar Marcus decidir se vale o setup (adiciona ~100MB ao CI).
- **Modo escuro da landing** — não pediu; skipped.
- **PWA/manifest** — não aplica (o app é WhatsApp-based, não web app).

---

## Handoff Onda 5 → 6

Onda 6 foca em hardening final OWASP. Mas muitos itens já foram mitigados na Onda 3:

| OWASP Top 10 2021 | Status |
|---|---|
| A01 Broken Access Control | ✅ Auth endpoints + rate limit + audit log + validação Zod |
| A02 Cryptographic Failures | ✅ TLS no Neon/Vercel/Railway + bcrypt12 + JWT com expiry |
| A03 Injection | ✅ Drizzle parameterized queries + Zod validation |
| A04 Insecure Design | ⚠️ Parcial — webhook idempotency OK, workers separation pendente |
| A05 Security Misconfiguration | ✅ Security headers + CORS restritivo + `X-Powered-By` removido + fail-fast env |
| A06 Vulnerable Components | ✅ Lockfile saudável (item 21) + overrides esbuild |
| A07 Auth Failures | ✅ Rate limit + uniform error + timing-safe compare |
| A08 Data Integrity Failures | ✅ Stripe signature + Z-API token + dedup Redis |
| A09 Logging Failures | ⚠️ Winston OK, Sentry opcional, audit_log ativo |
| A10 SSRF | ✅ Sem SSRF direto; webhook Z-API img/audio só é "visto" pela IA |

A Onda 6 formaliza ASVS e produz `AUDIT/06-hardening.md` com evidência de cada checkbox.
