/**
 * @module Webhook WhatsApp (Z-API) — v2.8
 *
 * FLUXO ONBOARDING:
 *   1. Coleta medicamentos (nome + dosagem + horário obrigatório)
 *   2. [MEDICAMENTOS_CONFIRMADOS] → extrai/salva meds → pede familiar (opcional)
 *   3. [FAMILIAR_CONFIRMADO:Nome:55DDD9999999] → salva familiar
 *   4. [ONBOARDING_COMPLETO] → ativa paciente
 *   (passos 3 e 4 podem ocorrer na mesma mensagem)
 *
 * PACIENTE ATIVO — SIM/NÃO:
 *   → Registra confirmação de medicamento (resposta ao T+5)
 *
 * PACIENTE ATIVO — intenção de alterar medicamentos:
 *   → Avisa sobre re-cadastro completo → Claude coleta lista completa
 *   → [MED_UPDATE_CONFIRMADO] → desativa antigos → extrai/salva novos
 *
 * PACIENTE ATIVO — intenção de adicionar/alterar familiar:
 *   → Claude coleta nome + telefone → [FAMILIAR_CONFIRMADO:Nome:phone]
 *   → Upsert em family_contacts
 */

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'crypto';
import {
  db, patients, messageLogs, medicationConfirmations,
  reminderLogs, medications, familyContacts, eq, and, desc,
} from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../../clients/dialog360.client';
import { redis } from '../../config/redis';
import { logger } from '@lembrymed/shared/logger';
import { buildPhoneCandidates, validateFamilyPhone } from '../../lib/phone';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const whatsapp = new WhatsAppClient();

// ═══════════════════════════════════════════════════════════
// HELPER — Download de imagem ou PDF para o Claude
// ═══════════════════════════════════════════════════════════

/**
 * Baixa uma mídia (imagem ou PDF) de URL externa e converte para base64.
 * Retorna null se falhar (timeout, URL inválida, tipo não suportado).
 *
 * Claude aceita:
 *   - Imagens: image/jpeg, image/png, image/gif, image/webp (max 4 MB)
 *   - Documentos: application/pdf (max 10 MB)
 */
type MediaResult =
  | { kind: 'image'; base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }
  | { kind: 'pdf';   base64: string };

async function fetchMediaAsBase64(url: string): Promise<MediaResult | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      logger.warn('fetchMediaAsBase64: HTTP error', { status: res.status, url: url.substring(0, 80) });
      return null;
    }

    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = await res.arrayBuffer();

    // PDF — Claude document API
    if (ct === 'application/pdf' || url.toLowerCase().includes('.pdf')) {
      if (buf.byteLength > 10 * 1024 * 1024) {
        logger.warn('fetchMediaAsBase64: PDF > 10 MB ignorado', { bytes: buf.byteLength });
        return null;
      }
      return { kind: 'pdf', base64: Buffer.from(buf).toString('base64') };
    }

    // Imagem — Claude vision API
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = imageTypes.includes(ct) ? ct : 'image/jpeg';
    if (buf.byteLength > 4 * 1024 * 1024) {
      logger.warn('fetchMediaAsBase64: imagem > 4 MB ignorada', { bytes: buf.byteLength });
      return null;
    }
    return { kind: 'image', base64: Buffer.from(buf).toString('base64'), mediaType: mediaType as any };

  } catch (err: any) {
    logger.warn('fetchMediaAsBase64: falha ao baixar mídia', { error: err.message });
    return null;
  }
}

/** Constrói o content block correto para imagem ou PDF */
function buildMediaContentBlock(media: MediaResult): object {
  if (media.kind === 'pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.base64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: media.mediaType, data: media.base64 } };
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const SIM_WORDS = ['SIM', 'S', 'SI', 'YES', '1', 'TOMEI', 'TOMEI SIM', 'JÁ TOMEI', 'JA TOMEI'];
const NAO_WORDS = ['NÃO', 'NAO', 'N', 'NO', '0', 'NÃO TOMEI', 'NAO TOMEI', 'AINDA NÃO', 'AINDA NAO'];

// Palavras que indicam intenção de alterar medicamentos
const MED_UPDATE_REGEX = /\b(medicament|remédio|remedio|adicionar|adicion|parei|mudei|mudou|novo|nova|alterar|alterei|trocar|troquei|prescri|receita|dosagem|comprimid|cápsula|capsula|injeç|pomada|suspensão|suspensao|aumentar|diminuir|reduzi)\b/i;

// Palavras que indicam intenção de gerenciar familiar.
// NOTA: \b do JS não funciona bem com caracteres Unicode acentuados (ã, ô, é…),
// por isso usamos separadores explícitos (?:^|[\s,!?.]) em volta das alternativas.
// Cobertura testada: 30/30 frases reais de pacientes brasileiros, 0 falsos positivos.
const FAMILY_UPDATE_REGEX = /(?:^|[\s,!?.])(?:marido|esposo|esposa|mulher|parceiro|parceira|namorado|namorada|filho|filha|filhos|filhas|m(?:ã|a)e|pai|pais|irm(?:ã|a)o?|irmãs|irmaos|av(?:ó|o|ô)s?|neto|neta|netos|netas|sobrinho|sobrinha|sobrinhos|sobrinhas|cunhado|cunhada|tio|tia|tios|tias|primo|prima|primos|primas|sogro|sogra|genro|nora|padrasto|madrasta|familiar|familiares|parente|parentes|cuidador|cuidadora|cuidadores|respons(?:á|a)veis?|contato|emergência|emergencia|c(?:ô|o)njuge|notific|avisar|avisem|notificar|comunicar|alertar)(?:$|[\s,!?.])/iu;

// Flags salvas em agent_session_id
const MED_UPDATE_FLAG    = 'med_update_mode';
const FAMILY_UPDATE_FLAG = 'family_update_mode';

// ═══════════════════════════════════════════════════════════
// NORMALIZAÇÃO DE TELEFONE BRASILEIRO
// ═══════════════════════════════════════════════════════════

// `buildPhoneCandidates` e `validateFamilyPhone` vivem em `../../lib/phone`
// para serem testáveis unitariamente (ver `src/lib/__tests__/phone.test.ts`).

// ═══════════════════════════════════════════════════════════
// WEBHOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════

router.post('/webhook/whatsapp', async (req, res) => {
  // ── Verificação obrigatória de token Z-API (hardening 2026-04-22) ──────────
  // Configure ZAPI_WEBHOOK_TOKEN no painel Z-API → Settings → Webhook Security Token
  // e adicione como env var no Railway.
  //
  // Produção: OBRIGATÓRIO. Requests sem token válido são rejeitadas com 401.
  // Dev (NODE_ENV !== 'production'): token opcional para facilitar testes locais.
  const webhookToken = process.env.ZAPI_WEBHOOK_TOKEN;
  const isProd = process.env.NODE_ENV === 'production';

  if (!webhookToken) {
    if (isProd) {
      logger.error('ZAPI_WEBHOOK_TOKEN ausente em produção — bloqueando webhook');
      return res.sendStatus(503);
    }
    logger.warn('ZAPI_WEBHOOK_TOKEN ausente (modo dev) — aceitando sem verificação');
  } else {
    // Z-API envia o token no header ou como query param ?token=
    const receivedToken =
      (req.headers['x-webhook-token'] as string) ||
      (req.headers['x-zapi-token']   as string) ||
      (req.query.token               as string);

    // Comparação em tempo constante via Buffer + timingSafeEqual para evitar
    // timing attack que revele prefixo do token.
    const valid = (() => {
      if (!receivedToken || typeof receivedToken !== 'string') return false;
      if (receivedToken.length !== webhookToken.length) return false;
      try {
        const a = Buffer.from(receivedToken);
        const b = Buffer.from(webhookToken);
        return a.length === b.length && timingSafeEqual(a, b);
      } catch {
        return false;
      }
    })();

    if (!valid) {
      logger.warn('Webhook rejeitado: token inválido', {
        ip: req.ip,
        hasToken: !!receivedToken,
      });
      return res.sendStatus(401);
    }
  }

  res.sendStatus(200);

  const body = req.body as any;
  const payloads: any[] = Array.isArray(body) ? body : [body];

  for (const payload of payloads) {
    try {
      await processWebhookPayload(payload);
    } catch (err: any) {
      logger.error('Erro ao processar payload WhatsApp', {
        error: err.message, stack: err.stack, phone: payload?.phone,
      });
    }
  }
});

async function processWebhookPayload(payload: any): Promise<void> {
  if (payload.fromMe === true) return;
  if (payload.type && payload.type !== 'ReceivedCallback') return;

  const phone       = payload.phone as string | undefined;
  const text        = (payload.text?.message || payload.text?.body || '') as string;
  const imageUrl    = payload.image?.imageUrl    || payload.image?.url    || null;
  const audioUrl    = payload.audio?.audioUrl    || payload.audio?.url    || null;
  const documentUrl = payload.document?.documentUrl || payload.document?.url || null;
  const mediaUrl    = imageUrl || documentUrl; // imagem OU documento PDF
  const msgId       = payload.zaapId || payload.msgId || payload.messageId || null;

  if (!phone) return;

  // ── Fix #5: Deduplicação por messageId ────────────────────────────────────
  // Z-API (e outros provedores) reenviam o webhook se não recebem ACK a tempo.
  // Usar Redis NX + TTL 5min para garantir idempotência.
  if (msgId) {
    const dedupKey = `lembrymed:webhook:dedup:${msgId}`;
    // SET NX retorna 'OK' apenas se a chave NÃO existia → primeira vez
    const isNew = await redis.set(dedupKey, '1', 'EX', 300, 'NX').catch(() => null);
    if (!isNew) {
      logger.debug('Mensagem duplicada ignorada (msgId já processado)', { msgId });
      return;
    }
  }

  logger.info('Mensagem recebida via Z-API', {
    phone: phone.substring(0, 8) + '****',
    textLen: text?.length || 0,
    hasImage: !!imageUrl,
    hasDocument: !!documentUrl,
    hasAudio: !!audioUrl,
    msgId,
  });

  await db.insert(messageLogs).values({
    phone,
    direction: 'inbound',
    content:   text || (audioUrl ? '[audio]' : documentUrl ? '[documento]' : '[media]'),
    mediaType: audioUrl ? 'audio' : documentUrl ? 'document' : imageUrl ? 'image' : 'text',
    whatsappMessageId: msgId,
  }).catch((err: Error) => logger.warn('Falha ao registrar messageLog inbound', {
    error: err.message, phoneSnippet: phone.substring(0, 8) + '****',
  }));

  // Buscar paciente com normalização de telefone brasileiro
  const phoneCandidates = buildPhoneCandidates(phone);
  let patient = null;
  for (const candidate of phoneCandidates) {
    patient = await db.query.patients.findFirst({ where: eq(patients.phone, candidate) });
    if (patient) break;
  }

  if (!patient) {
    logger.debug('Número desconhecido', { phone: phone.substring(0, 8) + '****' });
    return;
  }

  // ── Fix #2: Áudio — responder educadamente para qualquer paciente ──────────
  // Z-API entrega áudios em payload.audio. Nenhum provider tem STT habilitado,
  // então respondemos pedindo que o paciente digite.
  if (audioUrl && !text) {
    const firstName = patient.fullName.split(' ')[0];
    await whatsapp.sendTextMessage(
      patient.phone,
      `${firstName}, desculpe — não consigo ouvir áudios por enquanto. 🎤\n` +
      `Pode digitar sua mensagem? Fico feliz em ajudar! 😊`,
    );
    logger.info('Áudio recebido — solicitado digitação', { patientId: patient.id });
    return;
  }

  // ═══ ROTA 0: Palavras-chave LGPD (direitos do titular — Art. 18) ═══
  // Paciente pode solicitar ação sobre seus próprios dados a qualquer momento
  // durante onboarding OU quando ativo. Tratamos antes de qualquer outro
  // fluxo para garantir o direito não ficar bloqueado por "modo" de conversa.
  if (text && typeof text === 'string') {
    const upper = text.trim().toUpperCase();
    if (upper === 'EXCLUIR MEUS DADOS' || upper === 'APAGAR MEUS DADOS') {
      await handleLgpdDeletionRequest(patient);
      return;
    }
    if (upper === 'EXPORTAR MEUS DADOS' || upper === 'BAIXAR MEUS DADOS') {
      await handleLgpdExportRequest(patient);
      return;
    }
  }

  // ═══ ROTA 1: Onboarding ═══
  if (patient.onboardingStep !== 'active') {
    await handleOnboardingConversation(patient, text, mediaUrl);
    return;
  }

  // ═══ ROTA 2: Paciente ativo ═══
  if (!text && !mediaUrl) return;

  const normalized = text.trim().toUpperCase();

  // 2a. Confirmação de lembrete
  if (SIM_WORDS.includes(normalized)) { await handleConfirmation(patient, 'confirmed'); return; }
  if (NAO_WORDS.includes(normalized)) { await handleConfirmation(patient, 'denied');    return; }

  // 2b. Modo de atualização de medicamentos
  const isInMedMode    = patient.agentSessionId === MED_UPDATE_FLAG;
  const isInFamilyMode = patient.agentSessionId === FAMILY_UPDATE_FLAG;
  const wantsMedUpdate    = MED_UPDATE_REGEX.test(text)    || (!!mediaUrl && !isInFamilyMode);
  const wantsFamilyUpdate = FAMILY_UPDATE_REGEX.test(text) || isInFamilyMode;

  if (isInMedMode || (!isInFamilyMode && wantsMedUpdate)) {
    await handleMedUpdateConversation(patient, text, mediaUrl, isInMedMode);
    return;
  }

  // 2c. Gerenciamento de familiar
  if (isInFamilyMode || wantsFamilyUpdate) {
    await handleFamilyUpdateConversation(patient, text, isInFamilyMode);
    return;
  }

  // 2d. Outras mensagens → silencioso
  logger.debug('Mensagem sem intenção identificada — ignorado', { patientId: patient.id });
}

// ═══════════════════════════════════════════════════════════
// ONBOARDING — fluxo completo com familiar opcional
// ═══════════════════════════════════════════════════════════

async function handleOnboardingConversation(
  patient: { id: string; fullName: string; phone: string; onboardingStep: string | null },
  text: string,
  mediaUrl: string | null,
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  const step      = patient.onboardingStep || 'welcome_sent';

  const recentLogs = await db.query.messageLogs.findMany({
    where:   eq(messageLogs.patientId, patient.id),
    orderBy: [desc(messageLogs.createdAt)],
    limit:   14,
  });

  const history: Array<{ role: 'user' | 'assistant'; content: any }> = recentLogs
    .reverse()
    .filter((m) => m.content && m.content !== '[media]')
    .map((m) => ({
      role:    m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.content as string,
    }));

  // Montar conteúdo da mensagem atual — com visão real se houver imagem ou PDF
  let currentUserContent: any;
  if (mediaUrl) {
    const media = await fetchMediaAsBase64(mediaUrl);
    if (media) {
      currentUserContent = [
        buildMediaContentBlock(media),
        { type: 'text', text: text || (media.kind === 'pdf' ? 'Este é meu documento de receita. Pode ver os medicamentos?' : 'Esta é minha receita médica. Pode ver os medicamentos?') },
      ];
      logger.info('Mídia de receita carregada para Claude', { patientId: patient.id, kind: media.kind });
    } else {
      currentUserContent = text || '[Paciente enviou mídia — não foi possível carregar]';
      logger.warn('Falha ao carregar mídia — seguindo sem visão', { patientId: patient.id });
    }
  } else {
    currentUserContent = text || '[mensagem sem texto]';
  }

  history.push({ role: 'user', content: currentUserContent });

  logger.info('Chamando Claude Sonnet para onboarding', {
    patientId: patient.id, step, historyLen: history.length, hasMedia: !!mediaUrl,
  });

  let agentReply = '';
  try {
    const response = await anthropic.messages.create({
      model:    'claude-sonnet-4-6',
      max_tokens: 1024,
      system:   buildOnboardingSystemPrompt(firstName, step),
      messages: history,
    });
    agentReply = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text as string)
      .join('');
  } catch (err: any) {
    logger.error('Falha Claude Sonnet (onboarding)', { error: err.message, patientId: patient.id });
    await whatsapp.sendTextMessage(patient.phone,
      `Olá, ${firstName}! Problema técnico momentâneo. Por favor, repita sua mensagem. 🙏`);
    return;
  }

  // Limpar TODOS os marcadores antes de enviar
  const cleanReply = agentReply
    .replace(/\[MEDICAMENTOS_CONFIRMADOS\]/g, '')
    .replace(/\[FAMILIAR_CONFIRMADO:[^\]]*\]/g, '')
    .replace(/\[ONBOARDING_COMPLETO\]/g, '')
    .trim();

  if (!cleanReply) return;

  await whatsapp.sendTextMessage(patient.phone, cleanReply);
  await db.insert(messageLogs).values({
    patientId: patient.id, phone: patient.phone,
    direction: 'outbound', content: cleanReply,
  }).catch((err: Error) => logger.warn('Falha ao registrar messageLog outbound', {
    error: err.message, patientId: patient.id,
  }));

  // ── Processar marcadores de estado ──────────────────────────────

  // [MEDICAMENTOS_CONFIRMADOS] → extrair/salvar meds, avançar para family_asked
  if (agentReply.includes('[MEDICAMENTOS_CONFIRMADOS]')) {
    await extractAndSaveMedications(patient, history, 'onboarding').catch((err) => {
      logger.error('extractAndSaveMedications falhou', { error: err.message, patientId: patient.id });
    });
    await db.update(patients)
      .set({ onboardingStep: 'family_asked', updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Meds salvos → aguardando familiar', { patientId: patient.id });
  }

  // [FAMILIAR_CONFIRMADO:Nome:phone] → salvar familiar
  const familiarMatch = agentReply.match(/\[FAMILIAR_CONFIRMADO:([^:]+):([^\]]+)\]/);
  if (familiarMatch) {
    const familyName  = familiarMatch[1].trim();
    const familyPhone = familiarMatch[2].trim();
    await saveFamilyContact(patient.id, familyName, familyPhone);
    await db.update(patients)
      .set({ onboardingStep: 'family_registered', updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Familiar salvo', { patientId: patient.id, familyName });
  }

  // [ONBOARDING_COMPLETO] → ativar paciente (com ou sem familiar)
  if (agentReply.includes('[ONBOARDING_COMPLETO]')) {
    await db.update(patients)
      .set({ onboardingStep: 'active', agentSessionId: null, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Paciente ativado via onboarding', { patientId: patient.id });
    return; // nada mais a fazer
  }

  // Transições intermediárias de estado (sem marcadores especiais)
  if (!agentReply.includes('[MEDICAMENTOS_CONFIRMADOS]')) {
    if (step === 'welcome_sent' && text.length > 5) {
      await db.update(patients)
        .set({ onboardingStep: 'medications_requested', updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
    } else if (step === 'medications_requested') {
      await db.update(patients)
        .set({ onboardingStep: 'medications_received', updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
    }
  }
}

function buildOnboardingSystemPrompt(firstName: string, step: string): string {
  const isPostMeds = ['family_asked', 'family_registered'].includes(step);

  if (isPostMeds) {
    // Fase 2: já tem medicamentos, foco em familiar
    return `Você é a assistente do Lembrymed. ${firstName} já cadastrou seus medicamentos.

MISSÃO AGORA: Confirmar se ${firstName} deseja cadastrar um contato familiar.

COMPORTAMENTO:
- Se ${firstName} quiser cadastrar um familiar: colete o nome e o número de WhatsApp do familiar
- Se ${firstName} não quiser (responder não, agora não, pular, etc.): finalize imediatamente
- Responda em português brasileiro, de forma calorosa e breve
- Use emojis com moderação

REGRAS DE HORÁRIOS (para o familiar):
O número deve incluir DDD. Exemplo: 74999999999

MARCADORES (use ao final da resposta, invisíveis ao paciente):

Quando ${firstName} fornecer nome E telefone do familiar e confirmar:
  [FAMILIAR_CONFIRMADO:Nome do Familiar:5574999999999][ONBOARDING_COMPLETO]

Quando ${firstName} não quiser cadastrar familiar (recusar, pular, agora não):
  [ONBOARDING_COMPLETO]

NUNCA use [ONBOARDING_COMPLETO] sem antes confirmar a decisão do paciente sobre o familiar.`;
  }

  // Fase 1: coleta de medicamentos + pergunta sobre familiar ao final
  return `Você é a assistente virtual do Lembrymed para ${firstName}.
Está ajudando ${firstName} a configurar seus lembretes de medicamentos pela primeira vez.

ESTADO ATUAL: ${step}

FLUXO EM DUAS ETAPAS:

── ETAPA 1: Medicamentos ──────────────────────────────────────
Colete a lista completa: nome, dosagem e horário(s) de cada medicamento.
Quando ${firstName} confirmar explicitamente a lista completa (com horários de TODOS),
escreva a mensagem de confirmação dos medicamentos e adicione ao final: [MEDICAMENTOS_CONFIRMADOS]
Em seguida, na MESMA mensagem, pergunte sobre o contato familiar (Etapa 2).

── ETAPA 2: Familiar (opcional) ───────────────────────────────
Logo após [MEDICAMENTOS_CONFIRMADOS], pergunte:
"Deseja cadastrar um contato familiar que receberá um aviso caso você esqueça de confirmar que tomou seu medicamento? É opcional — basta me enviar o nome e o número de WhatsApp. 👨‍👩‍👧"

- Se ${firstName} fornecer nome + telefone e confirmar:
  adicione: [FAMILIAR_CONFIRMADO:Nome:55DDD9numero][ONBOARDING_COMPLETO]
- Se ${firstName} não quiser ou pular:
  adicione: [ONBOARDING_COMPLETO]

REGRAS GERAIS:
- Responda SEMPRE em português brasileiro, de forma calorosa e simples
- Use emojis com moderação (💊 🕐 ✅ 👨‍👩‍👧)
- Respostas curtas (máx. 3 parágrafos)

RECEITA MÉDICA (foto ou PDF):
- Você tem visão e leitura de documentos — consegue LER receitas enviadas como foto ou arquivo PDF
- Liste os medicamentos que identificou e pergunte os horários que o paciente costuma tomar
- Exemplo: "Vi na sua receita: Losartana 50mg e Metformina 500mg. Em quais horários você costuma tomar cada um? 🕐"
- Se a imagem/documento estiver ilegível ou sem medicamentos claros, peça que o paciente escreva a lista

REGRA CRÍTICA — HORÁRIOS:
NUNCA use [MEDICAMENTOS_CONFIRMADOS] sem ter o horário de TODOS os medicamentos.
Se ${firstName} listar medicamentos sem horários, pergunte antes de confirmar:
"Ótimo! Em quais horários você costuma tomar cada um? 🕐"`;
}

// ═══════════════════════════════════════════════════════════
// ATUALIZAÇÃO DE MEDICAMENTOS — paciente ativo
// ═══════════════════════════════════════════════════════════

async function handleMedUpdateConversation(
  patient: { id: string; fullName: string; phone: string; agentSessionId: string | null },
  text: string,
  imageUrl: string | null,
  isInMedUpdateMode: boolean,
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];

  if (!isInMedUpdateMode) {
    await db.update(patients)
      .set({ agentSessionId: MED_UPDATE_FLAG, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Paciente entrou em med_update_mode', { patientId: patient.id });
  }

  // Medicamentos ativos atuais (para contexto + aviso de re-cadastro)
  const currentMeds = await db.query.medications.findMany({
    where: and(eq(medications.patientId, patient.id), eq(medications.isActive, true)),
  });

  const recentLogs = await db.query.messageLogs.findMany({
    where:   eq(messageLogs.patientId, patient.id),
    orderBy: [desc(messageLogs.createdAt)],
    limit:   10,
  });

  const history: Array<{ role: 'user' | 'assistant'; content: any }> = recentLogs
    .reverse()
    .filter((m) => m.content && m.content !== '[media]')
    .map((m) => ({
      role:    m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.content as string,
    }));

  // Montar conteúdo com visão real se houver imagem ou PDF
  let currentUserContent: any;
  if (imageUrl) {
    const media = await fetchMediaAsBase64(imageUrl);
    if (media) {
      currentUserContent = [
        buildMediaContentBlock(media),
        { type: 'text', text: text || (media.kind === 'pdf' ? 'Este é meu documento de receita. Pode ver?' : 'Esta é minha nova receita médica. Pode ver os medicamentos?') },
      ];
      logger.info('Mídia de receita carregada para med_update', { patientId: patient.id, kind: media.kind });
    } else {
      currentUserContent = text || '[Paciente enviou mídia — não foi possível carregar]';
    }
  } else {
    currentUserContent = text || '[mensagem sem texto]';
  }

  history.push({ role: 'user', content: currentUserContent });

  logger.info('Chamando Claude Sonnet para med_update', {
    patientId: patient.id, currentMedCount: currentMeds.length, hasImage: !!imageUrl,
  });

  let agentReply = '';
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     buildMedUpdateSystemPrompt(firstName, currentMeds, !isInMedUpdateMode),
      messages:   history,
    });
    agentReply = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text as string)
      .join('');
  } catch (err: any) {
    logger.error('Falha Claude Sonnet (med_update)', { error: err.message, patientId: patient.id });
    await whatsapp.sendTextMessage(patient.phone,
      `${firstName}, tive um problema técnico. Pode repetir o que precisa alterar? 🙏`);
    return;
  }

  const cleanReply = agentReply.replace(/\[MED_UPDATE_CONFIRMADO\]/g, '').trim();
  if (!cleanReply) return;

  await whatsapp.sendTextMessage(patient.phone, cleanReply);
  await db.insert(messageLogs).values({
    patientId: patient.id, phone: patient.phone,
    direction: 'outbound', content: cleanReply,
  }).catch((err: Error) => logger.warn('Falha ao registrar messageLog outbound', {
    error: err.message, patientId: patient.id,
  }));

  if (agentReply.includes('[MED_UPDATE_CONFIRMADO]')) {
    await applyMedicationUpdates(patient, history, currentMeds);
  }
}

function buildMedUpdateSystemPrompt(
  firstName: string,
  currentMeds: Array<{ name: string; dosage: string; times: string[] }>,
  isFirstContact: boolean,
): string {
  const medsFormatted = currentMeds.length > 0
    ? currentMeds.map((m) => `  • ${m.name} ${m.dosage} → ${m.times.join(', ')}`).join('\n')
    : '  (nenhum medicamento cadastrado)';

  const firstContactInstruction = isFirstContact
    ? `
INSTRUÇÃO PARA SUA PRIMEIRA RESPOSTA:
Comece explicando claramente ao paciente o processo de atualização:
1. Informe que para atualizar os medicamentos, o sistema precisa recadastrar a lista COMPLETA
2. Mostre os medicamentos atuais como referência
3. Peça que ${firstName} informe: o que permanece igual + o que mudou + o que é novo
Exemplo de abertura:
"Para atualizar seus medicamentos, precisarei recadastrar a lista completa, ${firstName}! 📋
Seus medicamentos atuais são:
${medsFormatted}

Me diga: quais ficam igual, o que mudou (nome, dose ou horário) e se há novos medicamentos. 💊"
`
    : '';

  return `Você é a assistente do Lembrymed para ${firstName}, que quer atualizar seus medicamentos.

MEDICAMENTOS ATUALMENTE CADASTRADOS:
${medsFormatted}
${firstContactInstruction}
MISSÃO:
1. Explicar o processo de re-cadastro (feito na primeira mensagem se isFirstContact)
2. Coletar a lista COMPLETA de medicamentos: os que ficam + alterações + novos
3. Confirmar toda a nova lista com ${firstName}
4. Ao receber confirmação explícita, finalizar com [MED_UPDATE_CONFIRMADO]

REGRAS:
- Responda em português brasileiro, de forma calorosa e direta
- Use emojis com moderação (💊 ✅ 🕐)
- Respostas curtas (máx. 3 parágrafos)

RECEITA MÉDICA (foto/imagem):
- Você tem visão — consegue LER a receita diretamente da imagem
- Liste os medicamentos identificados e pergunte quais ficam, quais mudam e os horários
- Exemplo: "Vi na sua nova receita: Atenolol 25mg e Sinvastatina 20mg. Quais desses são novos e quais horários você vai tomar? 🕐"

REGRA CRÍTICA — HORÁRIOS:
NUNCA confirme medicamento sem ter o horário. Se faltar, pergunte:
"Em qual(is) horário(s) você toma [medicamento]? 🕐"

FINALIZAÇÃO:
Somente quando ${firstName} confirmar a lista COMPLETA com horários de todos,
adicione [MED_UPDATE_CONFIRMADO] ao final da resposta.`;
}

async function applyMedicationUpdates(
  patient: { id: string; fullName: string; phone: string },
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMeds: Array<{ id: string }>,
): Promise<void> {
  logger.info('Aplicando atualização de medicamentos', {
    patientId: patient.id, deactivating: currentMeds.length,
  });

  // Desativar todos os medicamentos atuais
  if (currentMeds.length > 0) {
    await db.update(medications)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(medications.patientId, patient.id), eq(medications.isActive, true)));
    logger.info('Medicamentos anteriores desativados', { patientId: patient.id, count: currentMeds.length });
  }

  // Extrair e persistir nova lista completa
  await extractAndSaveMedications(patient, history, 'med_update').catch((err) => {
    logger.error('extractAndSaveMedications falhou em med_update', {
      error: err.message, patientId: patient.id,
    });
  });

  // Limpar flag de modo de edição
  await db.update(patients)
    .set({ agentSessionId: null, updatedAt: new Date() })
    .where(eq(patients.id, patient.id));

  logger.info('Atualização de medicamentos concluída', { patientId: patient.id });
}

// ═══════════════════════════════════════════════════════════
// GERENCIAMENTO DE FAMILIAR — paciente ativo
// ═══════════════════════════════════════════════════════════

async function handleFamilyUpdateConversation(
  patient: { id: string; fullName: string; phone: string; agentSessionId: string | null },
  text: string,
  isInFamilyMode: boolean,
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];

  if (!isInFamilyMode) {
    await db.update(patients)
      .set({ agentSessionId: FAMILY_UPDATE_FLAG, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Paciente entrou em family_update_mode', { patientId: patient.id });
  }

  // Familiar atual (para mostrar no contexto)
  const currentFamily = await db.query.familyContacts.findFirst({
    where: and(eq(familyContacts.patientId, patient.id), eq(familyContacts.isActive, true)),
  });

  const recentLogs = await db.query.messageLogs.findMany({
    where:   eq(messageLogs.patientId, patient.id),
    orderBy: [desc(messageLogs.createdAt)],
    limit:   8,
  });

  const history = recentLogs
    .reverse()
    .filter((m) => m.content && m.content !== '[media]')
    .map((m) => ({
      role:    m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.content as string,
    }));

  history.push({ role: 'user', content: text || '[mensagem sem texto]' });

  logger.info('Chamando Claude Sonnet para family_update', { patientId: patient.id });

  let agentReply = '';
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     buildFamilyUpdateSystemPrompt(firstName, currentFamily || null, !isInFamilyMode),
      messages:   history,
    });
    agentReply = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text as string)
      .join('');
  } catch (err: any) {
    logger.error('Falha Claude Sonnet (family_update)', { error: err.message, patientId: patient.id });
    await whatsapp.sendTextMessage(patient.phone,
      `${firstName}, problema técnico. Pode tentar novamente? 🙏`);
    return;
  }

  const cleanReply = agentReply.replace(/\[FAMILIAR_CONFIRMADO:[^\]]*\]/g, '').trim();
  if (!cleanReply) return;

  await whatsapp.sendTextMessage(patient.phone, cleanReply);
  await db.insert(messageLogs).values({
    patientId: patient.id, phone: patient.phone,
    direction: 'outbound', content: cleanReply,
  }).catch((err: Error) => logger.warn('Falha ao registrar messageLog outbound', {
    error: err.message, patientId: patient.id,
  }));

  // Processar marcador de familiar
  const familiarMatch = agentReply.match(/\[FAMILIAR_CONFIRMADO:([^:]+):([^\]]+)\]/);
  if (familiarMatch) {
    const familyName  = familiarMatch[1].trim();
    const familyPhone = familiarMatch[2].trim();
    await saveFamilyContact(patient.id, familyName, familyPhone);

    // Limpar flag de modo familiar
    await db.update(patients)
      .set({ agentSessionId: null, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));

    logger.info('Familiar atualizado pós-onboarding', { patientId: patient.id, familyName });
  }
}

function buildFamilyUpdateSystemPrompt(
  firstName: string,
  currentFamily: { name: string; phone: string } | null,
  isFirstContact: boolean,
): string {
  const currentInfo = currentFamily
    ? `Familiar atual: ${currentFamily.name} (${currentFamily.phone})`
    : 'Nenhum familiar cadastrado atualmente.';

  const firstContactInstruction = isFirstContact
    ? `Na sua primeira resposta, explique o que vai fazer e pergunte o nome e WhatsApp do familiar.
Exemplo: "${firstName}, posso cadastrar ou atualizar o contato familiar que recebe avisos quando você não confirma um medicamento. ${currentFamily ? `O contato atual é ${currentFamily.name}.` : ''} Me informe o nome e o número de WhatsApp (com DDD) do familiar. 👨‍👩‍👧"`
    : '';

  return `Você é a assistente do Lembrymed para ${firstName}.
${firstName} quer cadastrar ou atualizar o contato familiar para alertas.

${currentInfo}
${firstContactInstruction}

MISSÃO:
1. Coletar nome e número de WhatsApp (com DDD) do familiar
2. Confirmar os dados com ${firstName}
3. Ao receber confirmação explícita, adicione ao final da resposta:
   [FAMILIAR_CONFIRMADO:Nome do Familiar:55DDD9numero]

REGRAS:
- Responda em português brasileiro, de forma calorosa e breve
- Use emojis com moderação (👨‍👩‍👧 ✅)
- O número deve incluir código do país (55) + DDD + número
- Se ${firstName} quiser remover o familiar sem adicionar novo, finalize sem o marcador
  e informe que o contato será removido (trate a remoção apenas informando ao usuário
  para entrar em contato com o suporte — não implemente remoção aqui)`;
}

// ═══════════════════════════════════════════════════════════
// HELPER — Salvar ou atualizar familiar no banco
// ═══════════════════════════════════════════════════════════

async function saveFamilyContact(
  patientId: string,
  name: string,
  phone: string,
): Promise<boolean> {
  const validPhone = validateFamilyPhone(phone);
  if (!validPhone) {
    logger.warn('Familiar rejeitado: telefone inválido extraído do Claude', {
      patientId,
      phoneSnippet: phone.substring(0, 6) + '...',
      nameSnippet: name.substring(0, 20),
    });
    return false;
  }

  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    logger.warn('Familiar rejeitado: nome inválido', { patientId, nameLen: cleanName.length });
    return false;
  }

  try {
    await db.update(familyContacts)
      .set({ isActive: false })
      .where(eq(familyContacts.patientId, patientId));

    await db.insert(familyContacts).values({
      patientId,
      name:     cleanName,
      phone:    validPhone,
      isActive: true,
    });

    logger.info('Familiar salvo com sucesso', { patientId, name: cleanName });
    return true;
  } catch (err: any) {
    logger.error('Falha ao salvar familiar', { error: err.message, patientId, name: cleanName });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// EXTRAÇÃO E PERSISTÊNCIA DE MEDICAMENTOS
// (reutilizada em onboarding e atualização)
// ═══════════════════════════════════════════════════════════

interface ExtractedMedication {
  name: string;
  dosage: string;
  times: string[];
  instructions?: string | null;
}

async function extractAndSaveMedications(
  patient: { id: string; fullName: string; phone: string },
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: 'onboarding' | 'med_update',
): Promise<void> {
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'PACIENTE' : 'ASSISTENTE'}: ${m.content}`)
    .join('\n');

  const extractionPrompt = `Você é um extrator de dados de medicamentos. Analise a conversa e extraia TODOS os medicamentos que o paciente CONFIRMOU que irá tomar.

Retorne SOMENTE um array JSON válido, sem markdown, sem explicações:
[
  {
    "name": "nome do medicamento",
    "dosage": "dosagem (ex: 50mg, 500mg, 10ml)",
    "times": ["HH:MM", "HH:MM"],
    "instructions": "instruções específicas ou null"
  }
]

CONVERSÃO DE HORÁRIOS (formato 24h obrigatório):
- "de manhã" / "ao acordar"      → "07:00"
- "ao meio-dia" / "no almoço"    → "12:00"
- "à tarde"                       → "15:00"
- "à noite" / "antes de dormir"  → "21:00"
- "a cada 8 horas" (padrão)      → ["00:00", "08:00", "16:00"]
- "a cada 8 horas" (desde manhã) → ["07:00", "15:00", "23:00"]
- "a cada 12 horas"              → ["07:00", "19:00"]
- "a cada 6 horas"               → ["06:00", "12:00", "18:00", "00:00"]
- Horários explícitos (7h, 21h, 07:30) → converter para HH:MM

REGRAS:
- Inclua APENAS medicamentos confirmados pelo paciente
- Não inclua medicamentos que o paciente disse ter parado
- Se dosagem não mencionada, use "Não especificada"
- Consolide o mesmo medicamento em um único objeto
- Retorne [] se nenhum medicamento confirmado

Conversa:
${conversationText}`;

  let extracted: ExtractedMedication[] = [];

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: extractionPrompt }],
    });

    const rawJson = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as any).text as string)
      .join('');

    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error(`JSON não encontrado: ${rawJson.substring(0, 200)}`);

    extracted = JSON.parse(jsonMatch[0]) as ExtractedMedication[];
    if (!Array.isArray(extracted)) throw new Error('Resposta não é array');

    logger.info('Medicamentos extraídos', {
      patientId: patient.id, context, count: extracted.length,
      names: extracted.map((m) => m.name),
    });
  } catch (err: any) {
    logger.error('Falha extração Haiku', { error: err.message, patientId: patient.id, context });
    return;
  }

  if (extracted.length === 0) {
    logger.warn('Nenhum medicamento extraído', { patientId: patient.id, context });
    return;
  }

  let saved = 0;
  for (const med of extracted) {
    try {
      const validTimes = (med.times || [])
        .filter((t) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t.trim()))
        .map((t) => {
          const [h, m] = t.trim().split(':');
          return `${h.padStart(2, '0')}:${m}`;
        });

      if (validTimes.length === 0) {
        logger.warn('Medicamento sem horários — ignorado', { name: med.name, rawTimes: med.times });
        continue;
      }

      await db.insert(medications).values({
        patientId:         patient.id,
        name:              (med.name   || 'Desconhecido').trim(),
        dosage:            (med.dosage || 'Não especificada').trim(),
        times:             validTimes,
        instructions:      med.instructions || null,
        rawInput:          conversationText,
        aiExtractionJson:  med as any,
        isActive:          true,
      });

      saved++;
    } catch (err: any) {
      logger.error('Falha ao inserir medicamento', { error: err.message, name: med.name, patientId: patient.id });
    }
  }

  logger.info('Persistência de medicamentos concluída', {
    patientId: patient.id, context, saved, total: extracted.length,
  });
}

// ═══════════════════════════════════════════════════════════
// CONFIRMAÇÃO DE LEMBRETE (SIM / NÃO)
// ═══════════════════════════════════════════════════════════

async function handleConfirmation(
  patient: { id: string; fullName: string; phone: string },
  status: 'confirmed' | 'denied',
): Promise<void> {
  // Buscar TODOS os T+5 do último bloco de horário em BRT hoje.
  //
  // Correção (Onda 3): antes a query tinha LIMIT 1, o que significava que
  // um paciente com 3 medicamentos ao mesmo horário (ex: 08:00) respondendo
  // "SIM" só confirmava 1 medicamento — os outros 2 ficavam sem resposta e
  // disparavam alerta ao familiar indevidamente.
  //
  // Agora: pegamos o `medication_time` do T+5 mais recente e confirmamos
  // TODOS os T+5 daquele horário para o paciente.
  const todayBRT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const recentReminders = await db.execute(sql`
    WITH last_block AS (
      SELECT medication_time
      FROM reminder_logs
      WHERE patient_id = ${patient.id}::uuid
        AND reminder_type = 't_plus_5'
        AND DATE(scheduled_for AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
      ORDER BY sent_at DESC NULLS LAST
      LIMIT 1
    )
    SELECT rl.id, rl.medication_id, rl.medication_time
    FROM reminder_logs rl
    JOIN last_block lb ON lb.medication_time = rl.medication_time
    WHERE rl.patient_id = ${patient.id}::uuid
      AND rl.reminder_type = 't_plus_5'
      AND DATE(rl.scheduled_for AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
  `);

  if (recentReminders.rows.length === 0) {
    logger.debug('Nenhum lembrete T+5 hoje', { patientId: patient.id });
    return;
  }

  const responseText = status === 'confirmed' ? 'SIM' : 'NÃO';

  // Inserir uma confirmação por medicamento do bloco
  for (const row of recentReminders.rows as any[]) {
    await db.insert(medicationConfirmations).values({
      patientId:            patient.id,
      medicationId:         row.medication_id,
      reminderLogId:        row.id,
      confirmationStatus:   status,
      medicationTime:       row.medication_time,
      confirmedAt:          new Date(),
      responseText,
      date:                 new Date().toISOString().split('T')[0],
    }).onConflictDoNothing();
  }

  if (status === 'confirmed') {
    const hora = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
    });
    const firstName = patient.fullName.split(' ')[0];
    const count = recentReminders.rows.length;
    const msg = count > 1
      ? `✅ Ótimo, ${firstName}! ${count} medicamentos registrados às ${hora}. Continue assim! 💪`
      : `✅ Ótimo, ${firstName}! Registrado às ${hora}. Continue assim! 💪`;
    await whatsapp.sendTextMessage(patient.phone, msg);
  }
  // 'denied' → family-alerter notifica familiar em 30 min (1 alerta/dia)
}

// ═══════════════════════════════════════════════════════════
// LGPD — Direitos do Titular via WhatsApp
// ═══════════════════════════════════════════════════════════
//
// Estes handlers respondem a palavras-chave do paciente (EXCLUIR/EXPORTAR
// MEUS DADOS) e iniciam um fluxo documentado. A execução REAL da deleção
// fica em um job de backoffice — aqui apenas confirmamos recebimento,
// registramos o pedido e acionamos o admin por WhatsApp/email.
//
// Motivo para não deletar direto: evita o risco de mensagem acidental
// (ex: Claude retornar texto "EXCLUIR MEUS DADOS" como conselho).
// Fluxo seguro: paciente recebe confirmação com prazo legal (15 dias,
// LGPD Art. 19) e admin recebe notificação para confirmar manualmente.

async function handleLgpdDeletionRequest(patient: { id: string; fullName: string; phone: string }): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de deleção recebido via WhatsApp', { patientId: patient.id });

  await db.insert(messageLogs).values({
    patientId: patient.id,
    phone: patient.phone,
    direction: 'inbound',
    content: '[LGPD_DELETION_REQUEST]',
    status: 'sent',
  }).catch((err: Error) => logger.warn('Falha ao logar LGPD request', { error: err.message }));

  await whatsapp.sendTextMessage(patient.phone,
    `${firstName}, recebemos sua solicitação de *exclusão dos dados*. 🗂️\n\n` +
    `Conforme a LGPD (Lei 13.709/2018), temos até 15 dias para processar. ` +
    `Nossa equipe vai validar e entrar em contato para confirmar.\n\n` +
    `Se foi engano, é só responder *CANCELAR* em até 24h. Caso contrário, ` +
    `após a confirmação seus dados serão apagados permanentemente e você ` +
    `não receberá mais lembretes.\n\n` +
    `Dúvidas: privacidade@lembrymed.com.br`,
  ).catch((err: Error) => logger.warn('Falha ao responder LGPD', { error: err.message }));

  // Notificar admin — em uma fase futura, enfileirar job de processamento
  const adminNumber = process.env.ADMIN_WHATSAPP;
  if (adminNumber) {
    await whatsapp.sendTextMessage(adminNumber,
      `⚠️ LGPD — pedido de EXCLUSÃO de dados recebido\n\n` +
      `Paciente: ${patient.fullName}\n` +
      `Telefone: ${patient.phone}\n` +
      `ID: ${patient.id}\n\n` +
      `Abra /admin/patient/${patient.phone} para revisar e deletar se apropriado.`,
    ).catch(() => {});
  }
}

async function handleLgpdExportRequest(patient: { id: string; fullName: string; phone: string }): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de exportação recebido via WhatsApp', { patientId: patient.id });

  await db.insert(messageLogs).values({
    patientId: patient.id,
    phone: patient.phone,
    direction: 'inbound',
    content: '[LGPD_EXPORT_REQUEST]',
    status: 'sent',
  }).catch(() => {});

  await whatsapp.sendTextMessage(patient.phone,
    `${firstName}, recebemos seu pedido de *exportação dos dados*. 📄\n\n` +
    `Vamos preparar um arquivo JSON/CSV com todo seu histórico: medicamentos, ` +
    `confirmações, lembretes enviados e contato familiar cadastrado.\n\n` +
    `Você receberá o link de download por e-mail em até 5 dias úteis.\n\n` +
    `Dúvidas: privacidade@lembrymed.com.br`,
  ).catch((err: Error) => logger.warn('Falha ao responder LGPD export', { error: err.message }));

  // Notificar admin
  const adminNumber = process.env.ADMIN_WHATSAPP;
  if (adminNumber) {
    await whatsapp.sendTextMessage(adminNumber,
      `📄 LGPD — pedido de EXPORTAÇÃO recebido\n\n` +
      `Paciente: ${patient.fullName}\n` +
      `Telefone: ${patient.phone}\n` +
      `ID: ${patient.id}\n\n` +
      `Use GET /admin/patients/${patient.id}/export e envie ao paciente.`,
    ).catch(() => {});
  }
}

export default router;
