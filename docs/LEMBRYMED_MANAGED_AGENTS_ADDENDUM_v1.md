# LEMBRYMED × MANAGED AGENTS — Addendum de Integração v1.0

> **Complemento ao LEMBRYMED_MASTER_PROMPT_v1.md**
> **Data:** Abril 2026 | **Canal WhatsApp:** 360dialog (API oficial)
> **BIZZ.IA Intelligence Ecosystem — Documento Confidencial**

---

## ═══ RESUMO EXECUTIVO ═══

Este documento transforma a arquitetura do Lembrymed de 6 workers BullMQ/Redis
para 3 Claude Managed Agents rodando na infraestrutura da Anthropic.
O canal WhatsApp permanece 360dialog (BSP oficial da Meta).

**Resultado:** menos infra, menos código, mais inteligência, mesma confiabilidade.

---

## ═══ O QUE MUDA vs. MASTER PROMPT v1 ═══

### Componentes removidos

| Removido | Salvo/mês | Dev salvo |
|----------|-----------|-----------|
| Redis (Railway) | ~R$ 50 | — |
| 6 BullMQ workers | ~R$ 150–300 | ~40h |
| Retry + dead-letter queue code | — | ~15h |
| CRON scheduling customizado | — | ~10h |
| Monitoramento de filas | — | ~8h |
| **Total** | **~R$ 200–350** | **~73 horas** |

### Componentes adicionados

| Adicionado | Custo |
|-----------|-------|
| Managed Agents runtime | US$ 0,08/session-hour |
| Observabilidade Console Anthropic | Incluído |

### O que NÃO muda

- 360dialog (WhatsApp Business API oficial)
- Stripe (pagamentos e webhooks)
- Neon PostgreSQL (banco de dados)
- Vercel (dashboard + landing page)
- Railway (API server slim — apenas webhooks + tool executor)
- Claude Haiku (extração de medicamentos)
- Schema SQL completo (idêntico ao v1)
- Todos os templates de mensagem WhatsApp
- LGPD / compliance / disclaimer ANVISA

---

## ═══ CONSOLIDAÇÃO: 6 WORKERS → 3 AGENTES ═══

```
ANTES (v1 — BullMQ/Redis):          DEPOIS (v2 — Managed Agents):
                                    
Worker 1: Onboarding  ──┐           ┌──────────────────────────┐
Worker 2: Med Parser  ──┼──────►    │  AGENTE 1: ONBOARDING    │
                        │           │  1 sessão por paciente    │
                        │           │  Modelo: claude-sonnet-4-6│
                        │           └──────────────────────────┘
                        │
Worker 3: Scheduler  ───┤           ┌──────────────────────────┐
Worker 4: Sender     ───┼──────►    │  AGENTE 2: REMINDER      │
Worker 5: Family     ───┘           │  1 sessão CRON/minuto    │
                                    │  Modelo: claude-haiku-4-5│
                                    └──────────────────────────┘

Worker 6: Renewals   ──────────►    ┌──────────────────────────┐
                                    │  AGENTE 3: LIFECYCLE     │
                                    │  1 sessão CRON/diária    │
                                    │  Modelo: claude-haiku-4-5│
                                    └──────────────────────────┘
```

---

## ═══ SETUP INICIAL (UMA VEZ) ═══

### 1. Criar o Environment

O environment é o container cloud onde os agentes rodam. Criado uma única vez.

```typescript
// scripts/setup-managed-agents.ts

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const BETA_HEADER = { 'anthropic-beta': 'managed-agents-2026-04-01' };

async function setup() {
  // 1. Criar environment compartilhado
  const environment = await client.beta.environments.create({
    name: 'lembrymed-production',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' }, // precisa chamar 360dialog, Stripe, Neon
    },
  }, { headers: BETA_HEADER });

  console.log('Environment ID:', environment.id);
  // Salvar em .env como MANAGED_AGENT_ENV_ID

  // 2. Criar Agente de Onboarding
  const onboardingAgent = await client.beta.agents.create({
    name: 'Lembrymed Onboarding',
    model: 'claude-sonnet-4-6',
    system: ONBOARDING_PROMPT,
    tools: ONBOARDING_TOOLS,
  }, { headers: BETA_HEADER });

  console.log('Onboarding Agent ID:', onboardingAgent.id);
  // Salvar em .env como ONBOARDING_AGENT_ID

  // 3. Criar Agente de Lembretes
  const reminderAgent = await client.beta.agents.create({
    name: 'Lembrymed Reminder',
    model: 'claude-haiku-4-5-20251001',
    system: REMINDER_PROMPT,
    tools: REMINDER_TOOLS,
  }, { headers: BETA_HEADER });

  console.log('Reminder Agent ID:', reminderAgent.id);
  // Salvar em .env como REMINDER_AGENT_ID

  // 4. Criar Agente de Lifecycle
  const lifecycleAgent = await client.beta.agents.create({
    name: 'Lembrymed Lifecycle',
    model: 'claude-haiku-4-5-20251001',
    system: LIFECYCLE_PROMPT,
    tools: LIFECYCLE_TOOLS,
  }, { headers: BETA_HEADER });

  console.log('Lifecycle Agent ID:', lifecycleAgent.id);
  // Salvar em .env como LIFECYCLE_AGENT_ID
}
```

### 2. Novas variáveis de ambiente

```env
# ═══ MANAGED AGENTS (adicionais ao .env do v1) ═══
MANAGED_AGENT_ENV_ID=         # ID do environment criado no setup
ONBOARDING_AGENT_ID=          # ID do agente de onboarding
REMINDER_AGENT_ID=            # ID do agente de lembretes
LIFECYCLE_AGENT_ID=           # ID do agente de lifecycle
```

---

## ═══ AGENTE 1 — ONBOARDING (Detalhamento Completo) ═══

### Modelo: claude-sonnet-4-6
### Trigger: Webhook Stripe (payment_intent.succeeded)
### Duração da sessão: ~5–30 minutos (depende do paciente)
### Uma sessão por paciente novo

### System Prompt

```
Você é o assistente de onboarding do Lembrymed — um serviço de lembretes 
inteligentes de medicação via WhatsApp, 100% automatizado.

═══ SUA MISSÃO ═══
Guiar o novo paciente desde o primeiro contato até a ativação completa 
dos lembretes de medicação. Toda a comunicação acontece via WhatsApp 
usando a tool send_whatsapp.

═══ FLUXO OBRIGATÓRIO (siga na ordem) ═══

PASSO 1 — BOAS-VINDAS
• Envie mensagem de boas-vindas com o nome do paciente
• Confirme que a assinatura está ativa
• Pergunte se deseja cadastrar familiar como contato de segurança
• Atualize status: save_patient(step='welcome_sent')

PASSO 2 — FAMILIAR (condicional)
• Se respondeu SIM → peça nome e WhatsApp do familiar
• Cadastre com save_family_contact
• Envie confirmação ao paciente E mensagem de boas-vindas ao familiar
• Atualize: save_patient(step='family_registered')
• Se respondeu NÃO → pule para passo 3

PASSO 3 — SOLICITAR MEDICAMENTOS
• Peça que envie seus medicamentos (texto livre ou foto da bula/receita)
• Dê exemplos: "Tomo losartana 50mg às 8h e metformina 850mg às 8h e 20h"
• Atualize: save_patient(step='medications_requested')

PASSO 4 — PROCESSAR MEDICAMENTOS
• Quando receber texto → use parse_medication(type='text')
• Quando receber imagem/documento → use parse_medication(type='image')
• Atualize: save_patient(step='medications_received')

PASSO 5 — CONFIRMAR COM PACIENTE
• Envie resumo formatado:
  💊 Losartana 50mg — 08:00
  💊 Metformina 850mg — 08:00 e 20:00
• Pergunte: "Está correto? (SIM para confirmar)"
• Se SIM → save_medications + save_patient(step='medications_confirmed')
• Se correção → ajuste e repita confirmação

PASSO 6 — ATIVAR
• Confirme que lembretes estão ativados
• Informe que a partir de amanhã receberá avisos
• Atualize: save_patient(step='active')

═══ REGRAS ABSOLUTAS ═══
1. NUNCA dê orientação médica nem sugira medicamentos
2. NUNCA altere dosagens ou horários sem confirmação do paciente
3. Se não entender um medicamento, PEÇA para repetir ou enviar foto
4. Tom: empático, simples, acolhedor — público 50+ anos
5. Mensagens curtas — max 3 parágrafos por mensagem WhatsApp
6. Use emojis com moderação: 💊 ✅ 👋 🎉 ⏰
7. DISCLAIMER na primeira mensagem: "Este serviço não substitui orientação médica."
8. Toda comunicação em português brasileiro
9. Se o paciente fizer pergunta médica, responda: "Não posso orientar sobre 
   isso — consulte seu médico. Posso ajudar apenas com os lembretes!"
10. Se o paciente demorar mais de 2 horas para responder, envie um lembrete 
    gentil perguntando se precisa de ajuda para continuar o cadastro
```

### Custom Tools (5 tools)

```typescript
const ONBOARDING_TOOLS = [
  {
    type: 'agent_toolset_20260401',
    default_config: { enabled: false }, // desliga todas as built-in
  },
  {
    type: 'custom',
    name: 'send_whatsapp',
    description: `Envia mensagem via WhatsApp (360dialog API oficial) ao paciente 
    ou familiar. Use para TODAS as comunicações com o paciente. O backend executa 
    o envio via 360dialog e retorna status de entrega.`,
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número formato 5511999999999' },
        message: { type: 'string', description: 'Texto da mensagem (max 4096 chars)' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    type: 'custom',
    name: 'save_patient',
    description: `Atualiza o status de onboarding do paciente no banco de dados Neon.
    Chame a cada transição de passo para manter o estado sincronizado.`,
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        onboarding_step: {
          type: 'string',
          enum: ['welcome_sent', 'family_asked', 'family_registered',
                 'medications_requested', 'medications_received',
                 'medications_confirmed', 'active'],
        },
      },
      required: ['phone', 'onboarding_step'],
    },
  },
  {
    type: 'custom',
    name: 'save_family_contact',
    description: `Cadastra o familiar do paciente como contato de segurança. 
    O familiar receberá alertas quando o paciente não confirmar a tomada do medicamento.`,
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
        family_name: { type: 'string' },
        family_phone: { type: 'string' },
      },
      required: ['patient_phone', 'family_name', 'family_phone'],
    },
  },
  {
    type: 'custom',
    name: 'parse_medication',
    description: `Envia texto ou URL de imagem para Claude Haiku extrair medicamentos.
    Retorna JSON com array de {name, dosage, times[], instructions}.
    Se confidence < 0.7, peça ao paciente para repetir ou enviar foto.`,
    input_schema: {
      type: 'object',
      properties: {
        input_type: { type: 'string', enum: ['text', 'image'] },
        content: { type: 'string', description: 'Texto do paciente ou URL da imagem' },
      },
      required: ['input_type', 'content'],
    },
  },
  {
    type: 'custom',
    name: 'save_medications',
    description: `Salva a lista de medicamentos confirmada pelo paciente no banco e 
    ativa o sistema de lembretes. Só chame APÓS confirmação explícita do paciente.`,
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
        medications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              dosage: { type: 'string' },
              times: { type: 'array', items: { type: 'string' } },
              instructions: { type: 'string' },
            },
            required: ['name', 'dosage', 'times'],
          },
        },
      },
      required: ['patient_phone', 'medications'],
    },
  },
];
```

---

## ═══ AGENTE 2 — REMINDER (Detalhamento Completo) ═══

### Modelo: claude-haiku-4-5-20251001 (custo baixo, alto volume)
### Trigger: CRON a cada 1 minuto (Railway cron job simples)
### Duração da sessão: ~10–60 segundos por ciclo
### Uma sessão por ciclo de verificação

### System Prompt

```
Você é o motor de lembretes do Lembrymed. Sua função é verificar 
medicamentos pendentes e enviar lembretes no timing exato.

═══ FLUXO POR CICLO ═══

1. Chame get_pending_reminders(minutes_ahead=35) para obter a lista
2. Para cada medicamento pendente:
   a. Se faltam 25-35 min → envie lembrete T-30 (suave)
   b. Se faltam 0-10 min → envie lembrete T-5 (urgente)  
   c. Se passou 5 min do horário → envie confirmação T+5
3. Registre cada envio com log_reminder
4. Verifique confirmações pendentes com check_unconfirmed(delay=30)
5. Para cada não-confirmado há 30+ min:
   a. Busque familiar com get_family_contact
   b. Envie alerta ao familiar
   c. Registre com record_confirmation(status='no_response', alert_family=true)

═══ TEMPLATES DE MENSAGEM ═══

T-30 (suave):
"⏰ Daqui 30 minutos é hora de tomar sua {nome} {dosagem}. Prepare-se! 💊"

T-5 (urgente):
"💊 Em 5 minutos: Tome sua {nome} {dosagem}!"

T+5 (confirmação):
"Você tomou sua {nome} {dosagem}? Responda SIM ou NÃO 💊"

Confirmação positiva:
"✅ Ótimo! Registrado às {hora}. Boa saúde, {nome_paciente}! 🌟"

Alerta familiar:
"⚠️ Atenção, {nome_familiar}!
{nome_paciente} não confirmou que tomou {nome_med} {dosagem} às {horario}.
Por favor, verifique se está bem. 🙏"

═══ REGRAS ═══
1. Seja preciso com horários — nunca envie lembrete fora da janela
2. Nunca envie lembrete duplicado (verifique log_reminder antes)
3. Tom das mensagens: direto, breve, motivador
4. Se send_whatsapp falhar, registre erro mas NÃO re-envie (retry é do 360dialog)
5. Processo inteiro deve levar menos de 60 segundos
```

### Custom Tools (5 tools)

```typescript
const REMINDER_TOOLS = [
  {
    type: 'agent_toolset_20260401',
    default_config: { enabled: false },
  },
  {
    type: 'custom',
    name: 'get_pending_reminders',
    description: `Busca todos os medicamentos ativos cujo horário está dentro da janela 
    especificada. Retorna array com patient_id, patient_name, patient_phone, medication_id, 
    medication_name, dosage, scheduled_time, reminder_type_needed, already_sent_today.`,
    input_schema: {
      type: 'object',
      properties: {
        minutes_ahead: { type: 'number' },
        timezone: { type: 'string', default: 'America/Sao_Paulo' },
      },
      required: ['minutes_ahead'],
    },
  },
  {
    type: 'custom',
    name: 'send_whatsapp',
    description: 'Envia mensagem WhatsApp via 360dialog.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    type: 'custom',
    name: 'log_reminder',
    description: 'Registra envio de lembrete no banco. Impede duplicação.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        medication_id: { type: 'string' },
        reminder_type: { type: 'string', enum: ['t_minus_30', 't_minus_5', 't_plus_5'] },
        medication_time: { type: 'string' },
        status: { type: 'string', enum: ['sent', 'failed'] },
      },
      required: ['patient_id', 'medication_id', 'reminder_type', 'medication_time', 'status'],
    },
  },
  {
    type: 'custom',
    name: 'check_unconfirmed',
    description: `Busca lembretes T+5 enviados há mais de N minutos sem resposta 
    SIM/NÃO do paciente. Retorna lista para alerta familiar.`,
    input_schema: {
      type: 'object',
      properties: {
        delay_minutes: { type: 'number', description: 'Minutos desde o envio do T+5' },
      },
      required: ['delay_minutes'],
    },
  },
  {
    type: 'custom',
    name: 'get_family_contact',
    description: 'Busca familiar cadastrado do paciente.',
    input_schema: {
      type: 'object',
      properties: { patient_id: { type: 'string' } },
      required: ['patient_id'],
    },
  },
  {
    type: 'custom',
    name: 'record_confirmation',
    description: 'Registra resposta do paciente ou timeout.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        medication_id: { type: 'string' },
        status: { type: 'string', enum: ['confirmed', 'denied', 'no_response'] },
        medication_time: { type: 'string' },
        family_alerted: { type: 'boolean' },
      },
      required: ['patient_id', 'medication_id', 'status', 'medication_time'],
    },
  },
];
```

### CRON Trigger (Railway — código mínimo)

```typescript
// src/cron/reminder-trigger.ts
// Este é o ÚNICO cron que sobra no Railway — 1 arquivo, ~30 linhas

import cron from 'node-cron';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const BETA = { 'anthropic-beta': 'managed-agents-2026-04-01' };

// Roda a cada 1 minuto
cron.schedule('* * * * *', async () => {
  try {
    // Criar sessão efêmera do agente de lembretes
    const session = await client.beta.sessions.create({
      agent: process.env.REMINDER_AGENT_ID!,
      environment_id: process.env.MANAGED_AGENT_ENV_ID!,
      title: `Reminder cycle ${new Date().toISOString()}`,
    }, { headers: BETA });

    // Disparar o ciclo
    await client.beta.sessions.events.create(session.id, {
      events: [{
        type: 'user.message',
        content: [{
          type: 'text',
          text: `Execute o ciclo de lembretes. 
                 Horário atual: ${new Date().toISOString()}
                 Timezone: America/Sao_Paulo`,
        }],
      }],
    }, { headers: BETA });

    // Processar stream de tool calls
    await processSessionStream(session.id);

  } catch (error) {
    console.error('Reminder cycle failed:', error);
    // Aqui: alerta Slack/email se falhar
  }
});
```

---

## ═══ AGENTE 3 — LIFECYCLE (Detalhamento Completo) ═══

### Modelo: claude-haiku-4-5-20251001
### Trigger: CRON diário às 09:00 BRT
### Duração: ~30–120 segundos
### Uma sessão por dia

### System Prompt

```
Você é o gestor de lifecycle do Lembrymed. Roda uma vez por dia e cuida 
de renovações, suspensões e métricas.

═══ TAREFAS DIÁRIAS ═══

1. RENOVAÇÕES
   • Chame get_expiring_subscriptions(days=[30, 15, 3])
   • Para cada assinatura:
     - 30 dias: envie lembrete gentil com link de pagamento
     - 15 dias: envie lembrete mais direto
     - 3 dias: envie lembrete urgente
   • Marque o lembrete como enviado com mark_renewal_sent

2. SUSPENSÕES
   • Chame get_expired_subscriptions()
   • Para cada assinatura vencida:
     - Suspenda com suspend_subscription
     - Envie mensagem informando a suspensão
     - Ofereça link de renovação

3. MÉTRICAS (opcional)
   • Chame get_daily_metrics()
   • Se alguma métrica estiver fora do esperado, registre alerta

═══ TEMPLATES ═══

Renovação 30d:
"Olá, {nome}! 👋 Sua assinatura do Lembrymed vence em 30 dias ({data}).
Para continuar recebendo seus lembretes, renove aqui: {link}
Qualquer dúvida, responda esta mensagem!"

Renovação 3d (urgente):
"⚠️ {nome}, sua assinatura vence em 3 dias!
Sem renovação, seus lembretes serão pausados em {data}.
Renove agora: {link}"

Suspensão:
"😔 {nome}, sua assinatura do Lembrymed expirou.
Seus lembretes foram pausados.
Para reativar, renove aqui: {link}
Sentimos sua falta! 💊"
```

### Custom Tools (5 tools)

```typescript
const LIFECYCLE_TOOLS = [
  {
    type: 'agent_toolset_20260401',
    default_config: { enabled: false },
  },
  {
    type: 'custom',
    name: 'get_expiring_subscriptions',
    description: 'Busca assinaturas que vencem nos próximos N dias, filtrando as que já receberam lembrete.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'array', items: { type: 'number' } },
      },
      required: ['days'],
    },
  },
  {
    type: 'custom',
    name: 'send_whatsapp',
    description: 'Envia mensagem WhatsApp via 360dialog.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    type: 'custom',
    name: 'create_stripe_payment_link',
    description: 'Gera link de pagamento Stripe para renovação da assinatura.',
    input_schema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        plan: { type: 'string', default: 'annual' },
      },
      required: ['patient_id'],
    },
  },
  {
    type: 'custom',
    name: 'mark_renewal_sent',
    description: 'Marca que o lembrete de renovação foi enviado (30d, 15d ou 3d).',
    input_schema: {
      type: 'object',
      properties: {
        subscription_id: { type: 'string' },
        reminder_type: { type: 'string', enum: ['30d', '15d', '3d'] },
      },
      required: ['subscription_id', 'reminder_type'],
    },
  },
  {
    type: 'custom',
    name: 'suspend_subscription',
    description: 'Marca assinatura como suspensa e desativa lembretes do paciente.',
    input_schema: {
      type: 'object',
      properties: {
        subscription_id: { type: 'string' },
        patient_id: { type: 'string' },
      },
      required: ['subscription_id', 'patient_id'],
    },
  },
  {
    type: 'custom',
    name: 'get_expired_subscriptions',
    description: 'Busca assinaturas expiradas que ainda não foram suspensas.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    type: 'custom',
    name: 'get_daily_metrics',
    description: 'Retorna KPIs do dia: assinantes ativos, mensagens enviadas, taxa de confirmação, churn.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];
```

### CRON Trigger

```typescript
// src/cron/lifecycle-trigger.ts

cron.schedule('0 9 * * *', async () => { // 09:00 BRT todos os dias
  const session = await client.beta.sessions.create({
    agent: process.env.LIFECYCLE_AGENT_ID!,
    environment_id: process.env.MANAGED_AGENT_ENV_ID!,
    title: `Lifecycle ${new Date().toISOString().split('T')[0]}`,
  }, { headers: BETA });

  await client.beta.sessions.events.create(session.id, {
    events: [{
      type: 'user.message',
      content: [{
        type: 'text',
        text: `Execute as tarefas diárias de lifecycle.
               Data: ${new Date().toISOString().split('T')[0]}
               Timezone: America/Sao_Paulo`,
      }],
    }],
  }, { headers: BETA });

  await processSessionStream(session.id);
});
```

---

## ═══ TOOL EXECUTOR CENTRAL ═══

O backend Railway recebe tool calls de TODOS os 3 agentes e executa.

```typescript
// src/services/tool-executor.service.ts

import { db, patients, familyContacts, medications, 
         reminderLogs, subscriptions, medicationConfirmations } from '@lembrymed/database';
import { WhatsAppClient } from '../clients/dialog360.client';
import { extractMedications } from '../services/ai.service';
import { createPaymentLink } from '../services/stripe.service';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

const whatsapp = new WhatsAppClient({
  apiKey: process.env.DIALOG_API_KEY!,
  phoneNumberId: process.env.DIALOG_PHONE_NUMBER_ID!,
});

export async function executeTool(
  toolName: string, 
  input: Record<string, any>
): Promise<any> {
  
  switch (toolName) {

    // ─── COMUNICAÇÃO ───────────────────────────────────
    case 'send_whatsapp': {
      const result = await whatsapp.sendTextMessage(input.phone, input.message);
      return { 
        success: true, 
        message_id: result.messages[0].id,
        status: 'sent',
      };
    }

    // ─── PACIENTES ─────────────────────────────────────
    case 'save_patient': {
      const [updated] = await db.update(patients)
        .set({ 
          onboarding_step: input.onboarding_step,
          updated_at: new Date(),
        })
        .where(eq(patients.phone, input.phone))
        .returning();
      return { success: true, patient_id: updated.id, step: updated.onboarding_step };
    }

    // ─── FAMILIARES ────────────────────────────────────
    case 'save_family_contact': {
      const patient = await db.query.patients.findFirst({
        where: eq(patients.phone, input.patient_phone),
      });
      if (!patient) return { error: 'Paciente não encontrado' };
      
      const [contact] = await db.insert(familyContacts).values({
        patient_id: patient.id,
        name: input.family_name,
        phone: input.family_phone,
      }).returning();
      return { success: true, contact_id: contact.id };
    }

    case 'get_family_contact': {
      const contact = await db.query.familyContacts.findFirst({
        where: and(
          eq(familyContacts.patient_id, input.patient_id),
          eq(familyContacts.is_active, true),
        ),
      });
      return contact || { error: 'Nenhum familiar cadastrado' };
    }

    // ─── MEDICAMENTOS ──────────────────────────────────
    case 'parse_medication': {
      const result = await extractMedications(input.input_type, input.content);
      return result; // { medications: [...], confidence: 0.95 }
    }

    case 'save_medications': {
      const patient = await db.query.patients.findFirst({
        where: eq(patients.phone, input.patient_phone),
      });
      if (!patient) return { error: 'Paciente não encontrado' };

      const saved = [];
      for (const med of input.medications) {
        const [row] = await db.insert(medications).values({
          patient_id: patient.id,
          name: med.name,
          dosage: med.dosage,
          times: med.times,
          instructions: med.instructions || null,
          is_active: true,
        }).returning();
        saved.push(row);
      }
      return { success: true, count: saved.length, medication_ids: saved.map(s => s.id) };
    }

    // ─── LEMBRETES ─────────────────────────────────────
    case 'get_pending_reminders': {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + input.minutes_ahead * 60000);
      
      const pending = await db.execute(sql`
        SELECT 
          p.id as patient_id, p.full_name as patient_name, p.phone as patient_phone,
          m.id as medication_id, m.name as medication_name, m.dosage,
          unnest(m.times) as medication_time
        FROM patients p
        JOIN medications m ON m.patient_id = p.id
        JOIN subscriptions s ON s.patient_id = p.id
        WHERE p.is_active = true
          AND m.is_active = true
          AND s.status = 'active'
        ORDER BY medication_time
      `);
      
      // Filtrar por janela de tempo e verificar duplicatas
      // (lógica de dedup contra reminder_logs do dia)
      return { reminders: pending.rows };
    }

    case 'log_reminder': {
      const [log] = await db.insert(reminderLogs).values({
        patient_id: input.patient_id,
        medication_id: input.medication_id,
        reminder_type: input.reminder_type,
        medication_time: input.medication_time,
        status: input.status,
        sent_at: new Date(),
        scheduled_for: new Date(),
      }).returning();
      return { success: true, log_id: log.id };
    }

    case 'check_unconfirmed': {
      const cutoff = new Date(Date.now() - input.delay_minutes * 60000);
      const unconfirmed = await db.execute(sql`
        SELECT rl.*, p.full_name, p.phone, m.name as med_name, m.dosage
        FROM reminder_logs rl
        JOIN patients p ON p.id = rl.patient_id
        JOIN medications m ON m.id = rl.medication_id
        LEFT JOIN medication_confirmations mc 
          ON mc.patient_id = rl.patient_id 
          AND mc.medication_id = rl.medication_id
          AND mc.date = CURRENT_DATE
          AND mc.medication_time = rl.medication_time
        WHERE rl.reminder_type = 't_plus_5'
          AND rl.sent_at <= ${cutoff}
          AND rl.status = 'sent'
          AND mc.id IS NULL
      `);
      return { unconfirmed: unconfirmed.rows };
    }

    case 'record_confirmation': {
      const [conf] = await db.insert(medicationConfirmations).values({
        patient_id: input.patient_id,
        medication_id: input.medication_id,
        confirmation_status: input.status,
        medication_time: input.medication_time,
        confirmed_at: input.status !== 'no_response' ? new Date() : null,
        family_alerted: input.family_alerted || false,
        family_alert_sent_at: input.family_alerted ? new Date() : null,
        date: new Date(),
      }).onConflictDoUpdate({
        target: [medicationConfirmations.patient_id, medicationConfirmations.medication_id,
                 medicationConfirmations.medication_time, medicationConfirmations.date],
        set: { confirmation_status: input.status, confirmed_at: new Date() },
      }).returning();
      return { success: true, confirmation_id: conf.id };
    }

    // ─── LIFECYCLE ─────────────────────────────────────
    case 'get_expiring_subscriptions': {
      const results = [];
      for (const days of input.days) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        const dayStr = targetDate.toISOString().split('T')[0];
        
        const field = days === 30 ? 'renewal_reminder_30d_sent' 
                    : days === 15 ? 'renewal_reminder_15d_sent' 
                    : 'renewal_reminder_3d_sent';

        const expiring = await db.execute(sql`
          SELECT s.*, p.full_name, p.phone 
          FROM subscriptions s
          JOIN patients p ON p.id = s.patient_id
          WHERE s.status = 'active'
            AND DATE(s.expires_at) = ${dayStr}
            AND s.${sql.raw(field)} = false
        `);
        results.push({ days, subscriptions: expiring.rows });
      }
      return results;
    }

    case 'create_stripe_payment_link': {
      const link = await createPaymentLink(input.patient_id, input.plan || 'annual');
      return { success: true, payment_url: link.url };
    }

    case 'mark_renewal_sent': {
      const field = input.reminder_type === '30d' ? { renewal_reminder_30d_sent: true }
                  : input.reminder_type === '15d' ? { renewal_reminder_15d_sent: true }
                  : { renewal_reminder_3d_sent: true };
      
      await db.update(subscriptions)
        .set({ ...field, updated_at: new Date() })
        .where(eq(subscriptions.id, input.subscription_id));
      return { success: true };
    }

    case 'suspend_subscription': {
      await db.update(subscriptions)
        .set({ status: 'suspended', updated_at: new Date() })
        .where(eq(subscriptions.id, input.subscription_id));
      
      await db.update(medications)
        .set({ is_active: false })
        .where(eq(medications.patient_id, input.patient_id));
      
      return { success: true };
    }

    case 'get_expired_subscriptions': {
      const expired = await db.execute(sql`
        SELECT s.*, p.full_name, p.phone 
        FROM subscriptions s
        JOIN patients p ON p.id = s.patient_id
        WHERE s.status = 'active'
          AND s.expires_at < NOW()
      `);
      return { expired: expired.rows };
    }

    case 'get_daily_metrics': {
      const metrics = await db.execute(sql`
        SELECT 
          (SELECT COUNT(*) FROM patients WHERE is_active = true) as active_patients,
          (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subs,
          (SELECT COUNT(*) FROM reminder_logs WHERE DATE(sent_at) = CURRENT_DATE) as msgs_today,
          (SELECT COUNT(*) FROM medication_confirmations 
           WHERE date = CURRENT_DATE AND confirmation_status = 'confirmed') as confirmed_today,
          (SELECT COUNT(*) FROM medication_confirmations 
           WHERE date = CURRENT_DATE) as total_confirmations_today
      `);
      return metrics.rows[0];
    }

    default:
      return { error: `Tool desconhecida: ${toolName}` };
  }
}
```

---

## ═══ SSE STREAM PROCESSOR ═══

O coração da integração — processa eventos do Managed Agent em tempo real.

```typescript
// src/services/session-stream.service.ts

import Anthropic from '@anthropic-ai/sdk';
import { executeTool } from './tool-executor.service';

const client = new Anthropic();
const BETA = { 'anthropic-beta': 'managed-agents-2026-04-01' };

export async function processSessionStream(sessionId: string): Promise<void> {
  const stream = await client.beta.sessions.events.stream(sessionId, {
    headers: BETA,
  });

  for await (const event of stream) {
    switch (event.type) {
      case 'agent.tool_use': {
        // O agente quer executar uma custom tool
        console.log(`[${sessionId}] Tool call: ${event.name}`, event.input);
        
        const result = await executeTool(event.name, event.input);
        
        // Enviar resultado de volta ao agente
        await client.beta.sessions.events.create(sessionId, {
          events: [{
            type: 'tool_result',
            tool_use_id: event.id,
            content: [{ type: 'text', text: JSON.stringify(result) }],
          }],
        }, { headers: BETA });
        break;
      }

      case 'agent.message': {
        // O agente gerou uma resposta textual (para logging)
        const text = event.content
          ?.filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        if (text) console.log(`[${sessionId}] Agent:`, text);
        break;
      }

      case 'session.status_idle': {
        console.log(`[${sessionId}] Session idle — cycle complete`);
        return; // Sessão completou o trabalho
      }

      case 'session.error': {
        console.error(`[${sessionId}] Session error:`, event);
        // Alerta: Slack/email
        return;
      }
    }
  }
}
```

---

## ═══ WEBHOOK BRIDGE: WHATSAPP → AGENTE ═══

Quando o paciente responde no WhatsApp, a mensagem é roteada para a
sessão ativa do agente correspondente.

```typescript
// src/routes/webhooks/whatsapp.ts

import { Router } from 'express';
import { db, patients, messageConfirmations } from '@lembrymed/database';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const client = new Anthropic();
const BETA = { 'anthropic-beta': 'managed-agents-2026-04-01' };

router.post('/webhook/whatsapp', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.sendStatus(200);

  for (const msg of messages) {
    const phone = msg.from;
    const text = msg.text?.body || '';
    const imageUrl = msg.image?.url || msg.document?.url || null;

    // 1. Registrar mensagem no log
    await db.insert(messageLogs).values({
      phone,
      direction: 'inbound',
      content: text || '[media]',
      media_type: imageUrl ? 'image' : 'text',
      media_url: imageUrl,
      whatsapp_message_id: msg.id,
    });

    // 2. Buscar paciente e sessão ativa
    const patient = await db.query.patients.findFirst({
      where: eq(patients.phone, phone),
    });

    if (!patient) {
      console.log(`Mensagem de número desconhecido: ${phone}`);
      continue;
    }

    // 3. Se paciente tem sessão de onboarding ativa
    if (patient.agent_session_id) {
      const content: any[] = [];
      if (text) content.push({ type: 'text', text: `Paciente respondeu: "${text}"` });
      if (imageUrl) content.push({ type: 'text', text: `Paciente enviou imagem: ${imageUrl}` });

      await client.beta.sessions.events.create(patient.agent_session_id, {
        events: [{ type: 'user.message', content }],
      }, { headers: BETA });
      continue;
    }

    // 4. Se paciente ativo sem sessão → é resposta a lembrete
    if (patient.onboarding_step === 'active') {
      const normalized = text.trim().toUpperCase();
      if (['SIM', 'S', 'SI', 'YES', '1', 'TOMEI'].includes(normalized)) {
        await handleMedicationConfirmation(patient, 'confirmed');
      } else if (['NÃO', 'NAO', 'N', 'NO', '0'].includes(normalized)) {
        await handleMedicationConfirmation(patient, 'denied');
      }
      // Outras mensagens: ignorar ou responder com FAQ
    }
  }

  res.sendStatus(200);
});

async function handleMedicationConfirmation(
  patient: any, 
  status: 'confirmed' | 'denied'
) {
  // Encontrar o último lembrete T+5 enviado para este paciente hoje
  const lastReminder = await db.query.reminderLogs.findFirst({
    where: and(
      eq(reminderLogs.patient_id, patient.id),
      eq(reminderLogs.reminder_type, 't_plus_5'),
      sql`DATE(sent_at) = CURRENT_DATE`,
    ),
    orderBy: desc(reminderLogs.sent_at),
  });

  if (!lastReminder) return;

  await db.insert(medicationConfirmations).values({
    patient_id: patient.id,
    medication_id: lastReminder.medication_id,
    confirmation_status: status,
    medication_time: lastReminder.medication_time,
    confirmed_at: new Date(),
    date: new Date(),
  }).onConflictDoNothing();

  // Responder ao paciente
  const whatsapp = new WhatsAppClient();
  if (status === 'confirmed') {
    await whatsapp.sendTextMessage(patient.phone,
      `✅ Ótimo! Registrado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Boa saúde, ${patient.full_name}! 🌟`
    );
  } else {
    // Não respondeu → alerta familiar será tratado pelo agente Reminder no próximo ciclo
  }
}
```

---

## ═══ NOVA ESTRUTURA DE PASTAS (SIMPLIFICADA) ═══

```
lembrymed/
├── scripts/
│   └── setup-managed-agents.ts      # Setup único dos 3 agentes
├── packages/
│   ├── database/                     # Igual ao v1 (sem mudanças)
│   └── shared/                       # Igual ao v1
├── apps/
│   ├── api/                          # Railway (MUITO mais leve)
│   │   ├── src/
│   │   │   ├── index.ts              # Express server
│   │   │   ├── routes/
│   │   │   │   └── webhooks/
│   │   │   │       ├── stripe.ts     # → cria sessão agente onboarding
│   │   │   │       └── whatsapp.ts   # → roteia msg para sessão ativa
│   │   │   ├── services/
│   │   │   │   ├── tool-executor.ts  # Executor central de custom tools
│   │   │   │   ├── session-stream.ts # SSE stream processor
│   │   │   │   ├── ai.service.ts     # Claude Haiku (extração)
│   │   │   │   ├── stripe.service.ts # Payment links
│   │   │   │   └── dialog360.client.ts # 360dialog wrapper
│   │   │   ├── cron/
│   │   │   │   ├── reminder-trigger.ts  # CRON 1min → agente reminder
│   │   │   │   └── lifecycle-trigger.ts # CRON diário → agente lifecycle
│   │   │   ├── prompts/
│   │   │   │   ├── onboarding.prompt.ts
│   │   │   │   ├── reminder.prompt.ts
│   │   │   │   └── lifecycle.prompt.ts
│   │   │   └── config/
│   │   │       └── env.ts
│   │   └── Dockerfile
│   │
│   └── web/                          # Vercel — igual ao v1
│       └── (dashboard + landing)
│
├── .env.example
└── README.md
```

**Comparação de complexidade:**

| Métrica | v1 (BullMQ) | v2 (Managed Agents) |
|---------|-------------|---------------------|
| Arquivos no backend | ~25 | ~15 |
| Linhas de código estimadas | ~3.500 | ~1.800 |
| Processos Railway | 7 (API + 6 workers) | 1 (API + 2 crons) |
| Dependências | BullMQ, ioredis, node-cron | node-cron, @anthropic-ai/sdk |
| Tempo estimado de dev | 10–12 semanas | 5–7 semanas |

---

## ═══ CUSTOS COMPARATIVOS (1.000 assinantes) ═══

### v1 — BullMQ/Redis

| Item | Custo/mês |
|------|-----------|
| Railway (API + 6 workers) | ~R$ 250 |
| Railway Redis | ~R$ 50 |
| 360dialog | ~R$ 2.500 (90 msgs/paciente × R$ 0,028) |
| Neon PostgreSQL | ~R$ 100 |
| Claude Haiku (onboarding) | ~R$ 50 |
| Stripe fees | ~R$ 620 |
| Vercel | ~R$ 100 |
| **Total** | **~R$ 3.670/mês** |

### v2 — Managed Agents

| Item | Custo/mês |
|------|-----------|
| Railway (API + 2 crons) | ~R$ 80 |
| Managed Agents runtime | ~R$ 350* |
| 360dialog | ~R$ 2.500 |
| Neon PostgreSQL | ~R$ 100 |
| Claude tokens (dentro dos agentes) | ~R$ 200 |
| Stripe fees | ~R$ 620 |
| Vercel | ~R$ 100 |
| **Total** | **~R$ 3.950/mês** |

*Estimativa Managed Agents: ~1.500 sessões onboarding/mês (curtas) + 
43.200 sessões reminder (1/min × 30 dias) + 30 sessões lifecycle.
A maioria das sessões reminder dura <1 min → custo runtime baixo.

**Delta:** +R$ 280/mês (+7,6%) — pago em economia de dev time e manutenção.

---

## ═══ PLANO DE EXECUÇÃO REVISADO ═══

### FASE 1 — Setup (Semana 1)
- [ ] Monorepo Turborepo (igual v1)
- [ ] Schema Drizzle + Neon (igual v1)
- [ ] Script setup-managed-agents.ts
- [ ] Configuração .env com Agent IDs

### FASE 2 — Tool Executor + Webhooks (Semana 2-3)
- [ ] Tool executor central (todos os cases)
- [ ] 360dialog client wrapper
- [ ] Webhook Stripe → sessão onboarding
- [ ] Webhook WhatsApp → bridge para sessão
- [ ] SSE stream processor
- [ ] Testes com número WhatsApp real

### FASE 3 — Agente Reminder + Lifecycle (Semana 4)
- [ ] CRON triggers (reminder + lifecycle)
- [ ] Testes de ciclo completo
- [ ] Lógica de confirmação SIM/NÃO
- [ ] Alerta familiar

### FASE 4 — Dashboard Admin (Semana 5-6)
- [ ] Next.js dashboard (igual v1)
- [ ] Integração com métricas do agente lifecycle

### FASE 5 — Landing + Checkout + Go-Live (Semana 7)
- [ ] Landing page + checkout Stripe
- [ ] Beta com 20 pacientes
- [ ] Launch

**Total: 7 semanas (vs. 12 semanas do v1) — economia de 5 semanas.**

---

## ═══ RISCOS ESPECÍFICOS DO MANAGED AGENTS ═══

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Beta instável (lançou há 3 dias) | ALTO | Fallback: manter código BullMQ como plano B |
| Latência do SSE na sessão reminder | MÉDIO | Se >5s, migrar reminder para BullMQ e manter só onboarding+lifecycle como agents |
| Rate limit (60 creates/min) | BAIXO | Reminder cria 1 sessão/min — bem dentro do limite |
| Custo escala com sessões | MÉDIO | Monitorar custo/paciente mensal; otimizar duração de sessão |
| 360dialog + Managed Agents: dupla latência | MÉDIO | Custom tool send_whatsapp é async — não bloqueia |

---

> **Lembrymed × Managed Agents — Addendum v1.0**
> **BIZZ.IA Intelligence Ecosystem — Abril 2026**
> **Mantido com 360dialog como canal WhatsApp oficial**
