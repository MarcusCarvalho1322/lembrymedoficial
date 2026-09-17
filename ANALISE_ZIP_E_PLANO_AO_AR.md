# ANÁLISE COMPLETA — ZIP x TRABALHO JÁ REALIZADO
# E PLANO DEFINITIVO PARA IR AO AR

**Data:** Julho 2026
**Arquivos recebidos:** `LEMBRYMED AUDITORIA.zip` (71 arquivos + zip aninhado)

---

## 1. O QUE É O ZIP QUE VOCÊ MANDOU

O zip contém a **versão v2 "Arquitetura Híbrida"** do Lembrymed (Abril/2026), a **versão ANTERIOR** ao projeto que auditei.

| Componente | ZIP (v2, abril/2026) |
|-----------|----------------------|
| Onboarding | **Claude Managed Agents** (SDK beta, sessão persistente) |
| WhatsApp | **360dialog** (BSP oficial Meta) |
| Deploy | **Railway + Vercel** |
| Workers | 4 (3 BullMQ + 1 Managed Agent) |
| Extração IA | `ai.service.ts` (Haiku com suporte a imagem) |
| Arquivos únicos | `session-stream.service.ts`, `tool-executor.service.ts`, `setup-agents.ts`, prompts v1/v2 |

---

## 2. O QUE EU JÁ ANALISEI NO ONEDRIVE (A VERSÃO NOVA)

O projeto na pasta `OneDrive\LEMBRYMED PROJECT` é a **evolução pós-auditoria** (v2.10+). Nela, tudo o que está no zip **já foi superado**:

| Aspecto | ZIP (v2 antigo) | OneDrive (v2.10+ novo) | Vantagem da versão nova |
|---------|-----------------|------------------------|-------------------------|
| Managed Agents | Sim (SDK beta) | ❌ **Removido** (marcadores textuais diretos) | Menos dependência de beta, custo menor |
| WhatsApp | 360dialog | **Z-API** (primário) + 360dialog fallback | Ativação em 5 min, ~R$49/mês |
| LGPD | Básico | **Completo** (consent, audit log, retention 90d) | Compliance pronto |
| Segurança | — | **Hardened** (rate limit, timingSafeEqual, CORS) | Score 45→88 |
| IA | Anthropic apenas | **DeepSeek V3** + Anthropic fallback | 70% economia |
| Deploy | Railway + Vercel | **Docker + VPS + Caddy + CI/CD** | Centralizado, ~40% economia |
| Testes | 0 | **300 testes** (12 arquivos) | Confiabilidade |

**Conclusão:** ✅ **Tudo que está no zip já foi analisado.** O zip é o passado; o OneDrive é o presente. O que ainda não existia quando o zip foi criado (LGPD, DeepSeek, Docker, CI/CD) **eu já construí e entreguei** na pasta `C:\temp\Lembrymedoficial`.

---

## 3. O ÚNICO VALOR REAL DO ZIP

1. **Documentos de produto** (MASTER_PROMPT v1/v2, MANAGED_AGENTS_ADDENDUM) — úteis como histórico de decisões, mas descrevem a arquitetura antiga que foi descartada.
2. **`ai.service.ts`** — suporte a extração de medicamentos **por imagem de receita médica** (OCR via Claude vision). Isso NÃO está na versão atual do OneDrive (que só lê texto do WhatsApp). **É o único recurso do zip que pode valer a pena portar.**

---

## 4. COMO IR AO AR — PLANO DEFINITIVO

### O que JÁ está pronto (C:\temp\Lembrymedoficial)

✅ Código backend com DeepSeek V3
✅ Código frontend Next.js
✅ Docker Compose (dev + produção)
✅ CI/CD no GitHub Actions
✅ Scripts de backup/restore/healthcheck
✅ 300 testes passando
✅ Documentação completa

### O que FALTA para ir ao ar (7 passos)

| # | Passo | Quem faz | Tempo |
|---|-------|---------|-------|
| 1 | **Subir código no GitHub** (repo `lembrymedoficial`) | Marcus (arrastar pasta) | 10 min |
| 2 | **Criar conta DeepSeek** (platform.deepseek.com) e copiar API key | Marcus | 10 min |
| 3 | **Contratar VPS** (Hetzner CX22, ~R$25/mês) | Marcus | 15 min |
| 4 | **Criar/confirmar Z-API** (instância WhatsApp, ~R$49/mês) | Marcus | 15 min |
| 5 | **Criar/confirmar Neon** (banco PostgreSQL) | Marcus | 15 min |
| 6 | **Criar/confirmar Stripe** (produto R$149 + webhook) | Marcus | 15 min |
| 7 | **Deploy na VPS** (eu executo: Docker, Caddy SSL, .env) | Hermes | 2h |

### Ordem sugerida

**Semana 1:** Passos 1-2-3 (GitHub + DeepSeek + VPS)
**Semana 1:** Passo 7 (deploy em staging — domínio de teste)
**Semana 2:** Passos 4-5-6 (WhatsApp + banco + pagamento de produção)
**Semana 2:** Smoke test completo (onboarding, lembrete, alerta familiar, pagamento)
**Semana 3:** Lançamento com **15 dias grátis** (custo por assinante: R$ 2,09 — ver PLANO_LANCAMENTO_SOCIOS.md)

---

## 5. DECISÃO QUE PRECISO DE VOCÊ

**Quer que eu porte o suporte a imagem de receita médica** (do `ai.service.ts` antigo) para a versão nova?

- **SIM** → +1 dia de trabalho, diferencial forte na apresentação aos sócios ("paciente fotografa a receita e o bot lê")
- **NÃO** → manter como está, só texto via WhatsApp

---

## 6. PRÓXIMA AÇÃO IMEDIATA

Suba a pasta `C:\temp\Lembrymedoficial` no GitHub (repo `lembrymedoficial`). Assim que estiver no ar, me avise que eu começo o deploy na VPS.
