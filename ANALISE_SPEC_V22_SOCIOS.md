# ANÁLISE DA ESPECIFICAÇÃO V2.2 DOS SÓCIOS
### Parecer técnico Hermes · Julho 2026

> Especificação recebida via Gemini (sócios) · Analisada contra o código atual do repo `lembrymedoficial`.
> **Nenhuma alteração foi aplicada. Este documento é análise para decisão.**

---

## 1. VEREDITO GERAL

**A spec V2.2 é boa, comercialmente coerente e NÃO desmonta nada do que organizamos.**

- **Infraestrutura (Docker, Caddy, CI/CD, PostgreSQL, DeepSeek): impacto ZERO.** Todas as mudanças são aplicação-level. Nada do que construímos é descartado.
- **Código: impacto MÉDIO.** Toca 5 áreas (schema, webhook, scheduler, templates, checkout), mas nenhuma delas exige reescrever o que existe — são extensões e ajustes.
- **Esforço estimado: 7-10 dias de trabalho** (com testes).
- **Novo serviço externo: 1** (OpenAI Whisper para transcrição de áudio — API barata, ~R$ 0,04/min, não é plataforma de infra).

**Recomendação: APROVAR a spec, com 3 decisões pendentes antes de codar (seção 6).**

---

## 2. AVALIAÇÃO PONTO A PONTO (O QUE A SPEC PEDE vs O QUE EXISTE)

### 2.1 Banco de dados — ✅ IMPACTO BAIXO

| Pedido da spec | Estado atual | Veredito |
|----------------|--------------|----------|
| `subscriptions.planTier` | Não existe conceito de plano (1 preço só) | ✅ Aditivo, sem risco |
| `subscriptions.trialEndsAt`, `dataPurgeAt` | Não existem | ✅ Aditivo |
| `medications.recurrenceType`, `specificDay`, `lastTakenAt` | Não existem (meds são sempre diários) | ✅ Aditivo |
| `familyContacts.relationship`, `lastSwappedAt` | Não existem | ✅ Aditivo |
| Nova tabela `dataPurgeAuditLogs` | Não existe | ✅ Padrão conhecido |
| Migration Drizzle | Já temos 6 migrations + `apply-migration.ts` | ✅ Fluxo pronto, é só criar a 0007 |

**Tudo aditivo (ALTER TABLE ADD COLUMN + CREATE TABLE). Nenhuma coluna removida, nenhum dado em risco.**

### 2.2 Frontend & Checkout — ✅ IMPACTO BAIXO (com 1 lacuna crítica)

| Pedido | Estado | Veredito |
|--------|--------|----------|
| Remover menção a "foto de receita" da landing | Precisa verificar o texto atual | ✅ Cosmético |
| Cards Prata R$149 / Ouro R$239 (ancorado R$339) | Landing tem 1 plano | ✅ Frontend puro |
| Checkbox de blindagem civil no checkout | Checkout já tem checkbox LGPD — é acrescentar 1 | ✅ Padrão existente |
| Campos familiar condicionados ao Ouro | Não existem | ✅ Frontend puro |

> ⚠️ **LACUNA:** a spec fala de 2 planos no FRONTEND, mas não fala do BACKEND do Stripe:
> - Hoje existe **1** price ID (`STRIPE_PRICE_ANNUAL`) e o checkout é `mode: 'payment'` (pagamento único).
> - Para 2 planos reais, precisamos: criar 2 produtos no painel Stripe, 2 envs (`STRIPE_PRICE_SILVER`, `STRIPE_PRICE_GOLD`), e o webhook do Stripe gravar qual plano foi pago (via metadata) na coluna `planTier`.
> - **Sem isso, o Plano Ouro não existe no sistema** — é a lacuna mais importante da spec.

### 2.3 Backend & Webhook — ⚠️ IMPACTO MÉDIO (2 pontos já existem, 2 são novos)

| Pedido | Estado atual | Veredito |
|--------|--------------|----------|
| Recusar imagens com resposta orientada | O código HOJE **aceita** imagem (envia pro LLM vision) | ✅ Desativar é simples: ignorar mídia + responder texto fixo |
| Parser regex SIM/NÃO sem IA | **JÁ EXISTE** (`SIM_WORDS`/`NAO_WORDS` + `handleConfirmation` sem IA) | ✅ Só ampliar vocabulário ("ok", "já", "feito") |
| Áudio → Whisper → parser | **NÃO EXISTE** | 🟠 NOVO: baixar áudio da Z-API, chamar Whisper, parser no texto. +1 env var, timeout, fallback |
| Onboarding: JSON estrito | Já retorna JSON estrito (DeepSeek) | ✅ Ajuste de prompt |
| Recorrência semanal/mensal no onboarding | Não existe | 🟠 NOVO: prompt pergunta data da última dose, salva `lastTakenAt` |
| NUNCA mostrar mg nos lembretes | **HOJE MOSTRA** (`${dosage}` nos templates) | ✅ Fácil: remover o parâmetro dos templates |

> ⚠️ **Descoberta importante:** os templates atuais incluem a dosagem em TODAS as mensagens
> ("Hora de tomar sua Losartana **50mg**"). A blindagem clínica da spec é uma mudança
> pequena de código mas toca os 29 testes de `reminder-templates.test.ts`.

### 2.4 Workers & Scheduler — 🔴 IMPACTO MÉDIO-ALTO (é o coração do produto)

| Pedido | Estado atual | Veredito |
|--------|--------------|----------|
| Régua T=0 + T+10 (2 mensagens) | Hoje é **T-10 + T=0 + T+10** (3 mensagens) | 🟠 Mudar janelas do scheduler + remover T-10 |
| Alerta cuidador em T+20 | Hoje é delay de **30 min** após T+10 | 🟠 Ajustar delay para 10 min (total 20) |
| Alerta só no Plano Ouro | Hoje o alerta é **grátis para todos** | 🔴 Novo gate por `planTier` no family-alerter |
| Descartar jobs com atraso > 60 min | Não existe | ✅ Check simples no sender |
| Relatórios mensais = Ouro | Hoje o relatório vai para paciente E familiar, sempre | 🟠 Gate por plano |

> 🔴 **Este é o único ponto de atenção real da spec:** a régua de disparo é a função
> missão-crítica do sistema. Mexer nela exige **testes pesados** (os 34 testes de
> `scheduling-windows.test.ts` mudam todos) para garantir que não haja lembretes
> duplicados nem perdidos. Não é difícil — é só delicado.

### 2.5 Rotina LGPD (purge de dados) — ✅ IMPACTO BAIXO

| Pedido | Estado | Veredito |
|--------|--------|----------|
| Cron diário de expurgo (`dataPurgeAt <= now()`) | Já existe cron diário com retention de 90 dias | ✅ Mesmo padrão, nova regra |
| Log imutável em `dataPurgeAuditLogs` | Padrão `admin_audit_logs` já existe | ✅ Mesma ideia |

---

## 3. O QUE A SPEC NÃO COBRE (3 LACUNAS PARA DECIDIR)

### Lacuna 1 — Como o trial de 15 dias funciona tecnicamente?
A spec cria `trialEndsAt` mas não explica o mecanismo. Hoje o modelo é **pagamento único anual** (`mode: 'payment'`). Opções:

| Opção | Como funciona | Prós | Contras |
|-------|---------------|------|---------|
| A) Trial via Stripe Subscription | Cliente assina com 15 dias grátis, cobra depois | Automático, zero risco de calote | Muda o modelo atual (payment → subscription) |
| B) Trial manual | Sistema cria o paciente como `trial` sem cobrança; após 15 dias pede pagamento | Simples de implementar | Risco de não-pagamento no fim do trial |
| C) Cobrar já com garantia de 15 dias | Pagamento imediato, reembolso total se cancelar em 15 dias | Mantém modelo atual, zero mudança de fluxo | "Grátis" vira "reembolso" (comunicação diferente) |

**Minha recomendação: Opção C** — menor esforço, mantém o fluxo de pagamento atual, e o custo por lead continua ~R$ 2,09 (só que como reembolso ocasional). Se os sócios quiserem "15 dias realmente grátis", ir para a Opção A.

### Lacuna 2 — Comportamento do Plano Prata sem alerta ao cuidador
Se Prata não tem alerta T+20, o que acontece quando o paciente não confirma?

| Opção | Comportamento |
|-------|---------------|
| a) Silêncio total | Nada acontece. Paciente não tem rede de segurança |
| b) Mensagem de upsell | Após N não-confirmações, mensagem: "Quer proteger sua família? Conheça o Plano Ouro" |
| c) Alerta para o paciente | "Não esqueça seu remédio!" (reforço extra) |

**Minha recomendação: b)** — transforma a limitação em venda, e é 1 template de mensagem.

### Lacuna 3 — Cadastro do cuidador no checkout
A spec diz "campos do familiar condicionados ao Ouro" no checkout. Mas o onboarding por WhatsApp também pergunta sobre familiar hoje. **Definir:** o cuidador é cadastrado no checkout (web) ou na conversa (WhatsApp) ou ambos? Se no checkout, o webhook do Stripe precisa repassar esses dados para o onboarding (metadata do Stripe).

---

## 4. IMPACTO NA INFRAESTRUTURA QUE ORGANIZAMOS

| Componente que construímos | Impacto da V2.2 |
|----------------------------|-----------------|
| Docker Compose (dev/prod) | **ZERO** |
| Caddy (SSL/headers) | **ZERO** |
| CI/CD GitHub Actions | **ZERO** (rodam os mesmos comandos) |
| PostgreSQL container | ✅ Ganha 1 migration (0007) e 1 tabela nova |
| DeepSeek V3 (conversa) | **ZERO** — continua igual |
| Scripts backup/restore | **ZERO** |
| LLM provider abstraction | ✅ Ganha 1 caso de uso (áudio → Whisper é serviço separado) |

**Novo serviço externo:** OpenAI Whisper API
- Custo: ~US$ 0,006/minuto de áudio (~R$ 0,04/min)
- Novo segredo: `OPENAI_API_KEY` (ou endpoint Whisper alternativo self-hosted no futuro)
- Não quebra a centralização — é uma API de IA como o DeepSeek, não uma plataforma de hospedagem

---

## 5. ORDEM DE IMPLEMENTAÇÃO RECOMENDADA (3 ondas)

### Onda 1 — Blindagem e planos (3-4 dias, baixo risco)
1. Migration 0007 (colunas novas + tabela `dataPurgeAuditLogs`)
2. Remover dosagem (mg) dos templates + ajustar 29 testes
3. Checkbox de blindagem civil no checkout
4. Recusa orientada de imagens
5. Ampliar vocabulário SIM/NÃO (sem IA, já existe)

### Onda 2 — Plano Ouro e régua (3-4 dias, risco médio)
6. Stripe: 2 produtos + 2 envs + webhook gravando `planTier`
7. Cards Prata/Ouro na landing + campos condicionais do cuidador
8. Gate de alerta familiar por `planTier` (Ouro)
9. Régua T=0 + T+10 + alerta T+20 (ajustar scheduler + 34 testes)
10. Descartar jobs atrasados > 60 min

### Onda 3 — Áudio e LGPD (2-3 dias)
11. Whisper: captura de áudio + transcrição + parser
12. Recorrência semanal/mensal (prompt + `lastTakenAt` + scheduler por dia)
13. Cron de purge LGPD com log imutável
14. Testes novos + build completo do monorepo

---

## 6. DECISÕES QUE PRECISO DOS SÓCIOS ANTES DE CODAR

| # | Decisão | Opções | Minha recomendação |
|---|---------|--------|-------------------|
| 1 | **Trial de 15 dias** | A) Subscription Stripe / B) Trial manual / C) Cobra + reembolso | **C** (menos risco) |
| 2 | **Prata sem alerta familiar** | a) Silêncio / b) Upsell / c) Reforço | **b** (vira venda) |
| 3 | **Cadastro do cuidador** | Web (checkout) / WhatsApp (onboarding) / Ambos | **Ambos** (web capta, WhatsApp confirma) |
| 4 | **Whisper: OpenAI ou self-hosted** | OpenAI API (~R$0,04/min) / Local (GPU) | **OpenAI API** (custo irrisório) |
| 5 | **T-10 removido de vez?** | Sim (só T=0/T+10) / Manter T-10 no Ouro | **Sim** (spec) — decidir se Ouro ganha T-10 como diferencial |

---

## 7. MINHA VISÃO (PARECER FINAL)

**A V2.2 é a evolução certa na hora certa.** Ela:

1. **Não mexe em nada do que organizamos** — Docker, CI/CD, PostgreSQL, DeepSeek, backups ficam intactos. É trabalho de aplicação, não de infraestrutura.
2. **Adiciona proteção jurídica inteligente** — a blindagem clínica (sem dosagem, sem leitura de receita, disclaimer) é exatamente o que um healthtech precisa para dormir tranquilo.
3. **Melhora a economia da unidade** — planos em camadas aumentam LTV; o gate de alerta por plano transforma recurso grátis em diferencial vendável.
4. **Usa bem o que já existe** — o parser SIM/NÃO, o cron LGPD e o padrão de migrations já estão lá; a spec só amplia.
5. **Tem 1 ponto delicado** (a régua de disparo) e **3 lacunas** (trial, Prata sem alerta, Stripe de 2 planos) que precisam de decisão antes de codar.

**Se aprovado: 7-10 dias de trabalho em 3 ondas, com os 300 testes atuais atualizados e build verde ao final de cada onda.**

Nada é aplicado sem seu OK.
