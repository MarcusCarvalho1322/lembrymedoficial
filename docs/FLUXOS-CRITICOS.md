# Fluxos Críticos — Lembrymed

Documentação dos 4 fluxos que, se quebrarem, o produto deixa de cumprir sua missão. Escrita em linguagem acessível para médico-empreendedor não-dev.

---

## 1. Envio do lembrete (T-30 / T-5 / T+5)

**Objetivo:** garantir que o paciente receba 3 mensagens para cada dose: 30 min antes, 5 min antes e 5 min depois do horário.

**Como funciona:**

```
A cada 1 minuto, um "relógio" checa todos os medicamentos ativos e
pergunta: "para cada paciente, qual dose está próxima do horário agora
em Brasília?". Se estiver na janela de 25-35 min, 0-10 min ou -10 a -3
min, ele coloca uma tarefa na "fila de envio". Em paralelo, um outro
processo pega cada tarefa da fila, manda via Z-API e registra o log.
```

**Onde no código:**
- `apps/api/src/workers/reminder-scheduler.worker.ts` — o relógio
- `apps/api/src/workers/reminder-sender.worker.ts` — o enviador
- Templates de mensagem em `TEMPLATES` dentro de `reminder-sender.worker.ts`

**Proteções contra duplicata:**
- `jobId` determinístico: `reminder-<patient>-<med>-<time>-<type>-<YYYY-MM-DD>`. BullMQ rejeita segunda tentativa com o mesmo jobId.
- Redis dedup de webhook em caso de re-entrega do Z-API.

**Sinais de que algo está errado:**
- Admin > Fila > "Com falha" > 0 consistente
- Paciente reclama que não recebeu lembrete
- Healthcheck Z-API está "disconnected"

**Runbook:** veja [`RUNBOOK.md`](RUNBOOK.md#z-api-offline).

---

## 2. Confirmação de tomada

**Objetivo:** registrar que o paciente tomou o remédio, para podermos exibir a adesão no dashboard e NÃO alertar o familiar.

**Como funciona:**

```
5 minutos DEPOIS do horário do remédio, o paciente recebe:
  "Você tomou sua <remédio>? Responda SIM ou NÃO"

Quando ele responder SIM (ou "já tomei", "tomei sim", "S"):
  1. Registramos TODOS os medicamentos daquele horário como 'confirmed'
     (ex: se às 08:00 ele toma losartana+metformina, o SIM vale para ambas).
  2. Respondemos: "Ótimo, registrado às 08:05. Continue assim!"

Se ele responder NÃO:
  1. Registramos como 'denied'
  2. Não respondemos nada imediato
  3. 30 minutos depois, SE NÃO HOUVER 'confirmed' do mesmo horário,
     avisamos o familiar cadastrado (1 alerta por dia no máximo).
```

**Onde no código:**
- `apps/api/src/routes/webhooks/whatsapp.ts` → `handleConfirmation`
- `apps/api/src/workers/family-alerter.worker.ts`

**Vocabulário de SIM/NÃO:**
```
SIM: SIM, S, SI, YES, 1, TOMEI, TOMEI SIM, JÁ TOMEI, JA TOMEI
NÃO: NÃO, NAO, N, NO, 0, NÃO TOMEI, NAO TOMEI, AINDA NÃO, AINDA NAO
```

Qualquer outra resposta no paciente ativo é ignorada silenciosamente, exceto se disparar uma das intenções (medicamento/familiar/LGPD).

---

## 3. Alerta ao familiar

**Objetivo:** se o paciente não confirma em 30 min, o cuidador sabe.

**Como funciona:**

```
Quando o sender envia o T+5 (5 min após o horário), ele também
agenda um job com delay de 30 min.

Passados os 30 min:
  1. Checa em medication_confirmations se o paciente já confirmou
  2. Se sim: cancela silenciosamente
  3. Se não: busca o familiar ativo do paciente
  4. Verifica se já mandamos alerta HOJE para esse familiar (dedup)
  5. Se não, envia:
     "⚠️ Atenção, <familiar>! <paciente> não confirmou que tomou
      <remédio> às <hora>. Por favor, verifique se está tudo bem."
  6. Grava em family_alert_logs (date + patient + family + status='sent')
```

**Regra de ouro:** **no máximo 1 mensagem por familiar por dia**, independente de quantos remédios o paciente deixou de confirmar. Isso evita que o familiar bloqueie o número por spam.

**Onde no código:** `apps/api/src/workers/family-alerter.worker.ts`.

---

## 4. Onboarding pós-pagamento

**Objetivo:** do clique do "Pagar" até o primeiro lembrete agendado, em menos de 10 minutos.

**Como funciona:**

```
Pagamento Stripe confirmado → webhook → criamos paciente + assinatura
→ enviamos mensagem de boas-vindas via Z-API → conversa rolar no WhatsApp
→ Claude Sonnet 4.6 conduz o diálogo até coletar:
    - Lista de medicamentos (nome, dose, horários)
    - (Opcional) Contato familiar

Quando a conversa fecha com [MEDICAMENTOS_CONFIRMADOS]:
  - Claude Haiku 4.5 extrai um JSON estruturado da conversa
  - Persistimos em medications
  - Avançamos onboarding_step para 'family_asked'

Quando fecha com [ONBOARDING_COMPLETO]:
  - Marcamos onboarding_step = 'active'
  - O scheduler passa a incluir este paciente nos lembretes 24h depois
```

**Nudges de reengajamento:** se o paciente ficar >2h parado em uma etapa, o worker `onboarding-nudge` envia uma mensagem carinhosa. Máximo 2 nudges por etapa. Depois disso, se houver familiar cadastrado, mandamos um aviso para ele pedir que o paciente responda.

**Palavras-chave LGPD (paciente):** a qualquer momento durante o onboarding ou quando ativo, o paciente pode mandar:
- `EXCLUIR MEUS DADOS` ou `APAGAR MEUS DADOS`
- `EXPORTAR MEUS DADOS` ou `BAIXAR MEUS DADOS`

O bot confirma recebimento, registra em `message_logs` com marcador especial e avisa o admin via `ADMIN_WHATSAPP`. A ação real (deleção/exportação) acontece dentro de 15 dias via trabalho do admin — **não é automática** para evitar que um paciente apague conta acidentalmente.

---

## O que acontece se algum passo falhar?

| Onde falhou                       | Consequência                                                            | O que precisa acontecer                          |
|------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------|
| Neon cai                          | API retorna 500. Lembretes param.                                       | Railway reinicia. Neon tem alta disponibilidade; cai raro. |
| Redis cai                         | Scheduler para de enfileirar. Dedup de webhook degrada para fail-open. | Railway reinicia Redis + BullMQ se reconecta.    |
| Z-API fica "disconnected"         | Lembretes não são entregues.                                            | Worker `zapi-health` alerta `ADMIN_WHATSAPP` em até 5 min. Marcus escaneia QR code no painel z-api.io. |
| Claude Anthropic fora             | Onboarding falha, responde fallback "problema técnico".                 | Paciente repete. Ou admin pode fazer "force re-onboarding". |
| Stripe webhook falha              | Retry pelo Stripe (até 72h).                                            | Idempotência Redis garante que não duplique.     |

Para procedimentos detalhados, [`RUNBOOK.md`](RUNBOOK.md).
