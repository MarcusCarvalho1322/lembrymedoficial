/**
 * @module Webhook WhatsApp (Z-API) — v2.9
 *
 * FLUXO ONBOARDING:
 *   1. Coleta medicamentos (nome + dosagem + horário obrigatório)
 *   2. [MEDICAMENTOS_CONFIRMADOS] → extrai/salva meds → pede familiar (opcional)
 *   3. [FAMILIAR_CONFIRMADO:Nome:55DDD9999999] → salva familiar DIRETAMENTE (onboarding)
 *   4. [ONBOARDING_COMPLETO] → ativa paciente
 *   (passos 3 e 4 podem ocorrer na mesma mensagem)
 *
 * PACIENTE ATIVO — SIM/NÃO:
 *   → Registra confirmação de medicamento (resposta ao T+10)
 *
 * PACIENTE ATIVO — intenção de alterar medicamentos:
 *   → Avisa sobre re-cadastro completo → Claude coleta lista completa
 *   → [MED_UPDATE_CONFIRMADO] → desativa antigos → extrai/salva novos
 *
 * PACIENTE ATIVO — intenção de adicionar/alterar familiar:
 *   → Claude coleta nome + telefone → [SOLICITAR_CONFIRMACAO_FAMILIAR:Nome:phone]
 *   → Sistema envia WhatsApp para o FAMILIAR pedindo confirmação
 *   → Familiar responde SIM/NÃO no próprio WhatsApp
 *   → SIM: salva em family_contacts + notifica paciente
 *   → NÃO: descarta + notifica paciente
 *
 * FAMILIAR (número desconhecido) — SIM/NÃO:
 *   → Redis key `lembrymed:family_confirm:{phone}` detecta pendência
 *   → Processa confirmação/recusa e notifica paciente
 */

import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  db, patients, messageLogs, medicationConfirmations,
  reminderLogs, medications, familyContacts, lgpdIncidents,
  subscriptions, eq, and, desc,
} from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../../clients/dialog360.client';
import { redis } from '../../config/redis';
import { env } from '../../config/env';
import { logger } from '@lembrymed/shared/logger';
import { buildPhoneCandidates, validateFamilyPhone } from '../../lib/phone';
import { getTodayBRT } from '../../lib/brt';
import { invalidateAndSync } from '../../lib/med-schedule-cache';
import { llmChat, ChatMessage, MediaBlock } from '../../lib/llm-provider';

const router = Router();
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

/** Constrói o MediaBlock correto para uso com o LLM provider */
function buildMediaBlock(media: MediaResult): MediaBlock {
  if (media.kind === 'pdf') {
    return { type: 'pdf', base64: media.base64 };
  }
  return { type: 'image', base64: media.base64, mediaType: media.mediaType };
}

// ═══════════════════════════════════════════════════════════
// SCHEMA ZOD — Validação do body do webhook WhatsApp
// ═══════════════════════════════════════════════════════════

const whatsappWebhookPayloadSchema = z.object({
  phone: z.string().optional(),
  fromMe: z.boolean().optional(),
  type: z.string().optional(),
  zaapId: z.string().optional(),
  msgId: z.string().optional(),
  messageId: z.string().optional(),
  text: z.object({
    message: z.string().optional(),
    body: z.string().optional(),
  }).optional(),
  image: z.object({
    imageUrl: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  audio: z.object({
    audioUrl: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  document: z.object({
    documentUrl: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
});

/** Array ou objeto único — Z-API pode mandar ambos */
const whatsappWebhookSchema = z.array(whatsappWebhookPayloadSchema).or(
  whatsappWebhookPayloadSchema.transform((p) => [p]),
);

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

// ═══ CONFIRMAÇÃO DE FAMILIAR — Redis ════════════════════════════
// Chave Redis para confirmação pendente do familiar (TTL 24h)
const FAMILY_CONFIRM_KEY  = (phone: string)     => `lembrymed:family_confirm:${phone}`;
// Chave Redis indexada pelo paciente — permite detectar pendência quando paciente insiste
const PATIENT_PENDING_KEY = (patientId: string) => `lembrymed:patient_pending_family:${patientId}`;

interface PendingFamilyConfirm {
  patientId:    string;
  patientPhone: string;
  patientName:  string;
  familyName:   string;
  familyPhone:  string;
  requestedAt:  string;
}

// ═══════════════════════════════════════════════════════════
// NORMALIZAÇÃO DE TELEFONE BRASILEIRO
// ═══════════════════════════════════════════════════════════

// `buildPhoneCandidates` e `validateFamilyPhone` vivem em `../../lib/phone`
// para serem testáveis unitariamente (ver `src/lib/__tests__/phone.test.ts`).

/**
 * Compara dois telefones ignorando formatação (máscara, espaços, hífens, +).
 * Retorna true se representam o mesmo número após normalizar apenas dígitos.
 * Usado para impedir que o paciente cadastre seu próprio número como familiar.
 */
function isSamePhone(a: string, b: string): boolean {
  const digits = (s: string) => s.replace(/\D/g, '');
  return digits(a) === digits(b);
}

/** Mensagem padrão enviada ao paciente quando tenta cadastrar seu próprio número */
const SELF_FAMILY_MSG =
  `⚠️ Pelas nossas diretrizes de uso, não é permitido cadastrar o seu próprio número como contato familiar — ` +
  `a notificação precisa chegar a outra pessoa.\n\n` +
  `Se ainda não decidiu quem colocar, sem problema! Você pode deixar esse campo em aberto e ` +
  `adicionar um familiar quando quiser. 😊`;

/** Mensagem quando paciente PRATA tenta usar recurso exclusivo do plano OURO. */
const FAMILY_UPGRADE_MSG =
  `O alerta ao familiar é um recurso exclusivo do *plano Ouro*. 💛\n\n` +
  `Se quiser, você pode fazer um upgrade de plano para ativar essa proteção extra. ` +
  `Fale com nosso suporte humano enviando a palavra AJUDA!`;

/**
 * Retorna o nível comercial do paciente: SILVER (Prata) | GOLD (Ouro).
 * Default SILVER — recurso de alerta familiar só é liberado no Ouro.
 */
async function getPatientPlanTier(patientId: string): Promise<string> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.patientId, patientId),
    orderBy: [desc(subscriptions.createdAt)],
  });
  return sub?.planTier || 'SILVER';
}

// ═══════════════════════════════════════════════════════════
// WEBHOOK PRINCIPAL
// ═══════════════════════════════════════════════════════════

router.post('/webhook/whatsapp', async (req, res) => {
  // ── Verificação de token Z-API (opcional — se ZAPI_WEBHOOK_TOKEN não estiver
  // configurado, aceita todas as requisições sem verificação).
  // Para habilitar: configure ZAPI_WEBHOOK_TOKEN no Railway + no painel Z-API.
  const webhookToken = env.ZAPI_WEBHOOK_TOKEN;

  if (webhookToken) {
    // Z-API envia o token no header ou como query param ?token=
    const receivedToken =
      (req.headers['x-webhook-token'] as string) ||
      (req.headers['x-zapi-token']   as string) ||
      (req.query.token               as string);

    // Comparação em tempo constante via timingSafeEqual para evitar timing attack
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

  const parseResult = whatsappWebhookSchema.safeParse(req.body);
  if (!parseResult.success) {
    logger.warn('Webhook WhatsApp: body inválido (Zod)', {
      ip: req.ip,
      issues: parseResult.error.issues.map((i) => i.message),
    });
    return; // já respondemos 200, payload inválido descartado
  }

  const payloads = parseResult.data;

  for (const payload of payloads) {
    try {
      await processWebhookPayload(payload);
    } catch (err: any) {
      logger.error('Erro ao processar payload WhatsApp', {
        error: err.message, stack: err.stack, phone: payload?.phone?.substring(0, 8) + '****',
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

  // ── Rate limit: max 30 mensagens por número por minuto ──────────────────
  // Protege contra flood/DoS de números que spammeiam o webhook.
  // Usa contador Redis com janela deslizante de 60s (INCR + TTL).
  const rateLimitKey = `lembrymed:webhook:ratelimit:${phone}`;
  const msgCount = await redis.incr(rateLimitKey).catch(() => 0);
  if (msgCount === 1) await redis.expire(rateLimitKey, 60).catch(() => {});
  if (msgCount > 30) {
    logger.warn('Webhook rate limit excedido — mensagem ignorada', {
      phone: phone.substring(0, 8) + '****', count: msgCount,
    });
    return;
  }

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
    // ── Verificar se é um FAMILIAR respondendo a uma solicitação pendente ──────
    if (text) {
      for (const candidate of phoneCandidates) {
        const raw = await redis.get(FAMILY_CONFIRM_KEY(candidate));
        if (raw) {
          const pending = JSON.parse(raw) as PendingFamilyConfirm;
          await handleFamilyConfirmationFromMember(phone, text, pending);
          return;
        }
      }
    }
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

  // 2c. Gerenciamento de familiar — exclusivo do plano OURO
  if (isInFamilyMode || wantsFamilyUpdate) {
    const tier = await getPatientPlanTier(patient.id);
    if (tier !== 'GOLD') {
      await whatsapp.sendTextMessage(patient.phone, FAMILY_UPGRADE_MSG);
      logger.info('Tentativa de gerenciar familiar no plano PRATA bloqueada', {
        patientId: patient.id, tier,
      });
      return;
    }
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
  imageUrl: string | null,
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  const step      = patient.onboardingStep || 'welcome_sent';

  // ── Plano comercial: alerta familiar é exclusivo do plano OURO ──────────
  // Prata (SILVER) = lembretes individuais, SEM pergunta/cadastro de familiar.
  const planTier    = await getPatientPlanTier(patient.id);
  const allowFamily = planTier === 'GOLD';

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
  if (imageUrl) {
    const media = await fetchMediaAsBase64(imageUrl);
    if (media) {
      currentUserContent = [
        buildMediaBlock(media),
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
    patientId: patient.id, step, historyLen: history.length, hasMedia: !!imageUrl,
  });

  let agentReply = '';
  try {
    const mediaBlocks: MediaBlock[] = [];
    if (imageUrl) {
      const media = await fetchMediaAsBase64(imageUrl);
      if (media) mediaBlocks.push(buildMediaBlock(media));
    }

    const response = await llmChat(history as ChatMessage[], {
      system: buildOnboardingSystemPrompt(firstName, step, patient.phone, allowFamily),
      maxTokens: 1024,
      media: mediaBlocks.length > 0 ? mediaBlocks : undefined,
    });
    agentReply = response.text;
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

  // [MEDICAMENTOS_CONFIRMADOS] → extrair/salvar meds
  if (agentReply.includes('[MEDICAMENTOS_CONFIRMADOS]')) {
    await extractAndSaveMedications(patient, history, 'onboarding').catch((err) => {
      logger.error('extractAndSaveMedications falhou', { error: err.message, patientId: patient.id });
    });
    if (allowFamily) {
      // Ouro: avança para a pergunta do familiar
      await db.update(patients)
        .set({ onboardingStep: 'family_asked', updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
      logger.info('Meds salvos → aguardando familiar (plano OURO)', { patientId: patient.id });
    } else {
      // Prata: sem etapa de familiar — ativa direto
      await db.update(patients)
        .set({ onboardingStep: 'active', agentSessionId: null, updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
      logger.info('Meds salvos → paciente ativado sem familiar (plano PRATA)', { patientId: patient.id });
      invalidateAndSync().catch(() => {});
      return;
    }
  }

  // [FAMILIAR_CONFIRMADO:Nome:phone] → salvar familiar
  const familiarMatch = agentReply.match(/\[FAMILIAR_CONFIRMADO:([^:]+):([^\]]+)\]/);
  if (familiarMatch) {
    const familyName  = familiarMatch[1].trim();
    const familyPhone = familiarMatch[2].trim().replace(/\D/g, '');

    // Diretriz de uso: paciente não pode cadastrar o próprio número como familiar
    if (isSamePhone(familyPhone, patient.phone)) {
      await whatsapp.sendTextMessage(patient.phone, SELF_FAMILY_MSG);
      logger.warn('Familiar rejeitado: mesmo número do paciente (onboarding)', {
        patientId: patient.id,
      });
    } else {
      await saveFamilyContact(patient.id, familyName, familyPhone, patient.fullName);
      await db.update(patients)
        .set({ onboardingStep: 'family_registered', updatedAt: new Date() })
        .where(eq(patients.id, patient.id));
      logger.info('Familiar salvo', { patientId: patient.id, familyName });
    }
  }

  // [ONBOARDING_COMPLETO] → ativar paciente (com ou sem familiar)
  if (agentReply.includes('[ONBOARDING_COMPLETO]')) {
    await db.update(patients)
      .set({ onboardingStep: 'active', agentSessionId: null, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    logger.info('Paciente ativado via onboarding', { patientId: patient.id });
    // Sincronizar cache Redis: novo paciente ativo deve receber lembretes imediatamente
    invalidateAndSync().catch(() => {});
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

function buildOnboardingSystemPrompt(
  firstName: string,
  step: string,
  patientPhone: string,
  allowFamily: boolean,
): string {
  const isPostMeds = allowFamily && ['family_asked', 'family_registered'].includes(step);

  if (isPostMeds) {
    // Fase 2 (somente plano OURO): já tem medicamentos, foco em familiar
    return `Você é a assistente do Lembrymed. ${firstName} já cadastrou seus medicamentos.

MISSÃO AGORA: Confirmar se ${firstName} deseja cadastrar um contato familiar.

COMPORTAMENTO:
- Se ${firstName} quiser cadastrar um familiar: colete o nome e o número de WhatsApp do familiar
- Se ${firstName} não quiser (responder não, agora não, pular, etc.): finalize imediatamente
- Responda em português brasileiro, de forma calorosa e breve
- Use emojis com moderação

REGRAS DE HORÁRIOS (para o familiar):
O número deve incluir DDD. Exemplo: 74999999999

REGRA DE SEGURANÇA — NÚMERO PRÓPRIO:
NUNCA use [FAMILIAR_CONFIRMADO] com o número ${patientPhone} (que é o próprio número de ${firstName}).
Se ${firstName} fornecer esse número como contato familiar, explique com gentileza:
"Pelas nossas diretrizes de uso, não é permitido usar o seu próprio número como contato familiar — a notificação precisa chegar a outra pessoa. 😊 Você pode deixar esse campo em aberto agora e adicionar um familiar quando decidir!"
Em seguida, use [ONBOARDING_COMPLETO] para finalizar normalmente.

MARCADORES (use ao final da resposta, invisíveis ao paciente):

Quando ${firstName} fornecer nome E telefone do familiar e confirmar:
  [FAMILIAR_CONFIRMADO:Nome do Familiar:5574999999999][ONBOARDING_COMPLETO]

Quando ${firstName} não quiser cadastrar familiar (recusar, pular, agora não, ou fornecer o próprio número):
  [ONBOARDING_COMPLETO]

NUNCA use [ONBOARDING_COMPLETO] sem antes confirmar a decisão do paciente sobre o familiar.`;
  }

  // Fase 1: coleta de medicamentos (+ pergunta sobre familiar somente se Ouro)
  const familyBlock = allowFamily
    ? `\n── ETAPA 2: Familiar (opcional — plano Ouro) ────────────────\nLogo após [MEDICAMENTOS_CONFIRMADOS], pergunte:\n"Deseja cadastrar um contato familiar que receberá um aviso caso você esqueça de confirmar que tomou seu medicamento? É opcional — basta me enviar o nome e o número de WhatsApp. 👨‍👩‍👧"\n\n- Se ${firstName} fornecer nome + telefone e confirmar:\n  adicione: [FAMILIAR_CONFIRMADO:Nome:55DDD9numero][ONBOARDING_COMPLETO]\n- Se ${firstName} não quiser ou pular:\n  adicione: [ONBOARDING_COMPLETO]\n\nREGRA DE SEGURANÇA — NÚMERO PRÓPRIO:\nNUNCA use [FAMILIAR_CONFIRMADO] com o número ${patientPhone} (o próprio número de ${firstName}).\nSe ${firstName} informar esse número como contato familiar, responda com gentileza:\n"Pelas nossas diretrizes de uso, não é permitido usar o seu próprio número como contato familiar — a notificação precisa chegar a outra pessoa. 😊 Você pode deixar esse campo em aberto e adicionar um familiar quando decidir!"\nNesse caso, finalize com [ONBOARDING_COMPLETO] sem [FAMILIAR_CONFIRMADO].`
    : `\nIMPORTANTE — PLANO PRATA:\nEste paciente está no plano Prata, que NÃO inclui o alerta ao familiar.\nNÃO pergunte sobre contato familiar em nenhum momento.\nAo confirmar os medicamentos com [MEDICAMENTOS_CONFIRMADOS], finalize a MESMA mensagem com [ONBOARDING_COMPLETO].\nNUNCA use [FAMILIAR_CONFIRMADO].`;

  return `Você é a assistente virtual do Lembrymed para ${firstName}.
Está ajudando ${firstName} a configurar seus lembretes de medicamentos pela primeira vez.

ESTADO ATUAL: ${step}

FLUXO DE CADASTRO:

── ETAPA 1: Medicamentos ──────────────────────────────────────
Colete a lista completa: nome, dosagem e horário(s) de cada medicamento.
Quando ${firstName} confirmar explicitamente a lista completa (com horários de TODOS),
escreva a mensagem de confirmação dos medicamentos e adicione ao final: [MEDICAMENTOS_CONFIRMADOS]${familyBlock}

REGRAS GERAIS:
- Responda SEMPRE em português brasileiro, de forma calorosa e simples
- Use emojis com moderação (💊 🕐 ✅)
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
        buildMediaBlock(media),
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
    const response = await llmChat(history as ChatMessage[], {
      system:    buildMedUpdateSystemPrompt(firstName, currentMeds, !isInMedUpdateMode),
      maxTokens: 1024,
    });
    agentReply = response.text;
  } catch (err: any) {
    logger.error('Falha LLM (med_update)', { error: err.message, patientId: patient.id });
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
  // Nota: extractAndSaveMedications já chama invalidateAndSync() internamente
  await extractAndSaveMedications(patient, history, 'med_update').catch((err) => {
    logger.error('extractAndSaveMedications falhou em med_update', {
      error: err.message, patientId: patient.id,
    });
    // Se extraction falhou, ainda assim invalida cache (meds antigos foram desativados)
    invalidateAndSync().catch(() => {});
  });

  // Limpar flag de modo de edição
  await db.update(patients)
    .set({ agentSessionId: null, updatedAt: new Date() })
    .where(eq(patients.id, patient.id));

  logger.info('Atualização de medicamentos concluída', { patientId: patient.id });
}

// ═══════════════════════════════════════════════════════════
// GERENCIAMENTO DE FAMILIAR — paciente ativo (2-step confirmation)
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

  // ── Verificar se já existe uma confirmação pendente para este paciente ───────
  // Caso o paciente insista novamente, informamos Claude para agir diretamente.
  const patientPendingRaw = await redis.get(PATIENT_PENDING_KEY(patient.id));
  const pendingForPatient = patientPendingRaw ? JSON.parse(patientPendingRaw) as PendingFamilyConfirm : null;

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

  logger.info('Chamando Claude Sonnet para family_update', {
    patientId: patient.id, hasPending: !!pendingForPatient,
  });

  let agentReply = '';
  try {
    const response = await llmChat(history as ChatMessage[], {
      system:    buildFamilyUpdateSystemPrompt(
        firstName,
        currentFamily || null,
        !isInFamilyMode,
        pendingForPatient,
        patient.phone,
      ),
      maxTokens: 512,
    });
    agentReply = response.text;
  } catch (err: any) {
    logger.error('Falha LLM (family_update)', { error: err.message, patientId: patient.id });
    await whatsapp.sendTextMessage(patient.phone,
      `${firstName}, problema técnico. Pode tentar novamente? 🙏`);
    return;
  }

  // Limpar marcadores antes de enviar ao paciente
  const cleanReply = agentReply
    .replace(/\[SOLICITAR_CONFIRMACAO_FAMILIAR:[^\]]*\]/g, '')
    .replace(/\[FAMILIAR_DIRETO:[^\]]*\]/g, '')
    .replace(/\[FAMILIAR_CONFIRMADO:[^\]]*\]/g, '')
    .replace(/\[REMOVER_FAMILIAR\]/g, '')
    .trim();
  if (!cleanReply) return;

  await whatsapp.sendTextMessage(patient.phone, cleanReply);
  await db.insert(messageLogs).values({
    patientId: patient.id, phone: patient.phone,
    direction: 'outbound', content: cleanReply,
  }).catch((err: Error) => logger.warn('Falha ao registrar messageLog outbound', {
    error: err.message, patientId: patient.id,
  }));

  // ── Helper: limpar chaves Redis de pendência ──────────────────────────────
  const clearPendingRedis = async (familyPhone?: string) => {
    await redis.del(PATIENT_PENDING_KEY(patient.id));
    if (familyPhone) await redis.del(FAMILY_CONFIRM_KEY(familyPhone));
  };

  // ── Helper: limpar flag do paciente ──────────────────────────────────────
  const clearPatientFlag = async () => {
    await db.update(patients)
      .set({ agentSessionId: null, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
  };

  // ── [REMOVER_FAMILIAR] — paciente quer remover o familiar (sem confirmação) ─
  if (agentReply.includes('[REMOVER_FAMILIAR]')) {
    await db.update(familyContacts)
      .set({ isActive: false })
      .where(eq(familyContacts.patientId, patient.id));
    await clearPendingRedis(pendingForPatient?.familyPhone);
    await clearPatientFlag();
    logger.info('Familiar removido a pedido direto do paciente', { patientId: patient.id });
    return;
  }

  // ── [FAMILIAR_DIRETO:Nome:phone] — cadastro direto, sem confirmação do familiar ─
  // Usado quando o paciente insiste ou exerce autonomia sobre seus próprios dados.
  const diretoMatch = agentReply.match(/\[FAMILIAR_DIRETO:([^:]+):([^\]]+)\]/);
  if (diretoMatch) {
    const familyName  = diretoMatch[1].trim();
    const familyPhone = diretoMatch[2].trim().replace(/\D/g, '');

    // Diretriz de uso: paciente não pode cadastrar o próprio número como familiar
    if (isSamePhone(familyPhone, patient.phone)) {
      await whatsapp.sendTextMessage(patient.phone, SELF_FAMILY_MSG);
      logger.warn('Familiar rejeitado: mesmo número do paciente (direto)', {
        patientId: patient.id,
      });
      return;
    }

    await saveFamilyContact(patient.id, familyName, familyPhone, patient.fullName);
    // Cancelar confirmação pendente anterior (se existir) e notificar o familiar que a solicitação foi encerrada
    if (pendingForPatient) {
      await clearPendingRedis(pendingForPatient.familyPhone);
      // Se o familiar antigo for diferente do novo, notificar encerramento da solicitação
      if (pendingForPatient.familyPhone !== familyPhone) {
        await whatsapp.sendTextMessage(
          pendingForPatient.familyPhone,
          `ℹ️ A solicitação de cadastro de *${firstName}* foi cancelada pelo paciente. Você não precisa mais responder.`,
        ).catch(() => {});
      }
    }
    await clearPatientFlag();
    logger.info('Familiar cadastrado diretamente (autonomia do paciente)', {
      patientId: patient.id, familyName, familyPhone,
    });
    return;
  }

  // ── [SOLICITAR_CONFIRMACAO_FAMILIAR:Nome:phone] — fluxo 2-step padrão ────────
  const solicitarMatch = agentReply.match(/\[SOLICITAR_CONFIRMACAO_FAMILIAR:([^:]+):([^\]]+)\]/);
  if (solicitarMatch) {
    const familyName  = solicitarMatch[1].trim();
    const familyPhone = solicitarMatch[2].trim().replace(/\D/g, '');

    // Diretriz de uso: paciente não pode cadastrar o próprio número como familiar
    if (isSamePhone(familyPhone, patient.phone)) {
      await whatsapp.sendTextMessage(patient.phone, SELF_FAMILY_MSG);
      logger.warn('Familiar rejeitado: mesmo número do paciente (solicitação)', {
        patientId: patient.id,
      });
      return;
    }

    // Salvar pendência em DOIS índices Redis (por telefone do familiar e por ID do paciente)
    const pending: PendingFamilyConfirm = {
      patientId:    patient.id,
      patientPhone: patient.phone,
      patientName:  patient.fullName,
      familyName,
      familyPhone,
      requestedAt:  new Date().toISOString(),
    };
    await redis.set(FAMILY_CONFIRM_KEY(familyPhone),   JSON.stringify(pending), 'EX', 43200);
    await redis.set(PATIENT_PENDING_KEY(patient.id),   JSON.stringify(pending), 'EX', 43200);

    // Mensagem de confirmação para o familiar
    const familyFirstName = familyName.split(' ')[0];
    const confirmMsg =
      `👋 Olá, *${familyFirstName}*!\n\n` +
      `O paciente *${firstName}* quer te cadastrar como contato de emergência no *Lembrymed* 💊\n\n` +
      `Você receberá avisos no WhatsApp caso ele esqueça de confirmar que tomou um medicamento.\n\n` +
      `Responda *SIM* para aceitar ou *NÃO* para recusar.\n\n` +
      `_(Esta solicitação expira em 12 horas)_`;

    await whatsapp.sendTextMessage(familyPhone, confirmMsg);

    // Avisar paciente: prazo de 12h + sugestão de nudge + o que acontece se não confirmar
    const fallbackMsg = currentFamily
      ? `_(Se ${familyFirstName} não confirmar em 12 horas, *${currentFamily.name}* continuará como seu contato familiar.)_`
      : `_(Se ${familyFirstName} não confirmar em 12 horas, você ficará sem contato familiar cadastrado.)_`;

    await whatsapp.sendTextMessage(
      patient.phone,
      `📲 Mensagem enviada para *${familyName}*!\n\n` +
      `Assim que ele(a) responder *SIM*, o cadastro é ativado aqui automaticamente. ✅\n\n` +
      `Se puder, avise ${familyFirstName} que enviamos uma mensagem pelo WhatsApp e que ela precisa da confirmação dele(a). 😊\n\n` +
      fallbackMsg,
    ).catch((err: Error) => logger.warn('Falha ao enviar aviso de prazo ao paciente', { error: err.message }));

    await clearPatientFlag();

    logger.info('Solicitação de confirmação enviada ao familiar', {
      patientId: patient.id, familyName, familyPhone,
    });
    return;
  }

  // Fallback: marcador legado [FAMILIAR_CONFIRMADO] (caso Claude use o formato antigo)
  const familiarMatch = agentReply.match(/\[FAMILIAR_CONFIRMADO:([^:]+):([^\]]+)\]/);
  if (familiarMatch) {
    const familyName  = familiarMatch[1].trim();
    const familyPhone = familiarMatch[2].trim();
    await saveFamilyContact(patient.id, familyName, familyPhone, patient.fullName);
    await clearPendingRedis(familyPhone);
    await clearPatientFlag();
    logger.info('Familiar salvo via marcador legado', { patientId: patient.id, familyName });
  }
}

function buildFamilyUpdateSystemPrompt(
  firstName: string,
  currentFamily: { name: string; phone: string } | null,
  isFirstContact: boolean,
  pendingForPatient: { familyName: string; familyPhone: string } | null = null,
  patientPhone: string = '',
): string {
  const currentInfo = currentFamily
    ? `Familiar atual: ${currentFamily.name} (${currentFamily.phone})`
    : 'Nenhum familiar cadastrado atualmente.';

  const firstContactInstruction = isFirstContact
    ? `Na sua primeira resposta, explique o que vai fazer e pergunte o nome e WhatsApp do familiar.
Exemplo: "${firstName}, posso cadastrar ou atualizar o contato familiar que recebe avisos quando você não confirma um medicamento. ${currentFamily ? `O contato atual é ${currentFamily.name}.` : ''} Me informe o nome e o número de WhatsApp (com DDD) do familiar. 👨‍👩‍👧"`
    : '';

  // Contexto de confirmação pendente (aguardando resposta do familiar)
  const pendingContext = pendingForPatient
    ? `\n⚠️ SITUAÇÃO ATUAL: Já existe uma solicitação de confirmação enviada para *${pendingForPatient.familyName}* (${pendingForPatient.familyPhone}) aguardando resposta do familiar.
Se ${firstName} confirmar que quer MESMO assim cadastrar um novo familiar, alterar ou remover sem esperar a resposta, respeite a decisão imediatamente (autonomia do paciente — LGPD Art. 18).
Nesse caso use [FAMILIAR_DIRETO] ou [REMOVER_FAMILIAR] conforme a intenção.`
    : '';

  // Regra de segurança: impede cadastro do próprio número como familiar
  const selfPhoneRule = patientPhone
    ? `\nREGRA DE SEGURANÇA — NÚMERO PRÓPRIO:
NUNCA use [SOLICITAR_CONFIRMACAO_FAMILIAR], [FAMILIAR_DIRETO] ou [FAMILIAR_CONFIRMADO] com o número ${patientPhone} (o próprio número de ${firstName}).
Se ${firstName} fornecer esse número como contato familiar, responda com gentileza:
"Pelas nossas diretrizes de uso, não é permitido usar o seu próprio número como contato familiar — a notificação precisa chegar a outra pessoa. 😊 Você pode deixar esse campo em aberto e adicionar um familiar quando decidir!"
Não use nenhum marcador nesse caso — aguarde ${firstName} fornecer um número diferente ou desistir.`
    : '';

  return `Você é a assistente do Lembrymed para ${firstName}.
${firstName} quer cadastrar ou atualizar o contato familiar para alertas.

${currentInfo}
${firstContactInstruction}
${pendingContext}
${selfPhoneRule}

MISSÃO:
1. Coletar nome e número de WhatsApp (com DDD) do familiar
2. Confirmar os dados com ${firstName}
3. Ao receber confirmação explícita, informe que o sistema enviará uma mensagem de confirmação
   ao familiar e adicione ao final da resposta:
   [SOLICITAR_CONFIRMACAO_FAMILIAR:Nome do Familiar:55DDD9numero]

AUTONOMIA DO PACIENTE (LGPD Art. 18):
- Se ${firstName} insistir em cadastrar/alterar sem aguardar confirmação do familiar,
  ou invocar seu direito de decidir sobre os próprios dados, respeite IMEDIATAMENTE.
  Salve o familiar diretamente sem pedir nova confirmação:
  [FAMILIAR_DIRETO:Nome do Familiar:55DDD9numero]
  Mensagem: "Entendido, ${firstName}! Cadastro realizado agora mesmo. ✅"

- Se ${firstName} quiser REMOVER o familiar (com ou sem substituição por outro):
  use [REMOVER_FAMILIAR] ao final da resposta.
  Mensagem: "Pronto, ${firstName}! O contato familiar foi removido. Pode me chamar quando quiser cadastrar outro. 👨‍👩‍👧"

MENSAGEM MODELO para quando tiver os dados confirmados (fluxo normal):
"Perfeito, vou enviar a solicitação para *[Nome]* agora! 📲"
(Não explique prazos nem o que acontece se não confirmar — o sistema enviará essa informação automaticamente.)

REGRAS GERAIS:
- Responda em português brasileiro, de forma calorosa e breve
- Use emojis com moderação (👨‍👩‍👧 ✅)
- O número deve incluir código do país (55) + DDD + número
- Se ${firstName} desistir ou cancelar: encerre sem usar marcadores
- Nunca questione ou tente convencer ${firstName} a mudar de ideia quando ele(a) exercer autonomia`;
}

// ═══════════════════════════════════════════════════════════
// CONFIRMAÇÃO DO FAMILIAR — resposta ao pedido de cadastro
// ═══════════════════════════════════════════════════════════

async function handleFamilyConfirmationFromMember(
  familyPhone: string,
  text: string,
  pending: PendingFamilyConfirm,
): Promise<void> {
  const normalized    = text.trim().toUpperCase();
  const familyFirst   = pending.familyName.split(' ')[0];
  const patientFirst  = pending.patientName.split(' ')[0];

  const accepted = ['SIM', 'S', 'SI', 'YES', '1', 'ACEITO', 'ACEITAR', 'CONFIRMO', 'OK'].includes(normalized);
  const refused  = ['NÃO', 'NAO', 'N', 'NO', '0', 'RECUSO', 'RECUSAR', 'NEGAR', 'NÃO ACEITO', 'NAO ACEITO'].includes(normalized);

  if (!accepted && !refused) {
    // Mensagem ambígua → re-perguntar (mantém chave Redis, não deleta)
    await whatsapp.sendTextMessage(
      familyPhone,
      `${familyFirst}, não entendi sua resposta 😊\n\n` +
      `*${patientFirst}* quer te cadastrar como contato de emergência no Lembrymed.\n\n` +
      `Responda apenas *SIM* para aceitar ou *NÃO* para recusar.`,
    );
    logger.info('Resposta ambígua do familiar — re-perguntando', {
      familyPhone: familyPhone.substring(0, 8) + '****', normalized,
    });
    return;
  }

  // ── Deletar chaves Redis independente da resposta ────────────────────────
  await redis.del(FAMILY_CONFIRM_KEY(familyPhone));
  await redis.del(FAMILY_CONFIRM_KEY(pending.familyPhone)); // garante limpeza por ambos os formatos
  await redis.del(PATIENT_PENDING_KEY(pending.patientId));  // limpa índice pelo paciente (autonomia)

  if (accepted) {
    // Salvar familiar no banco
    await saveFamilyContact(pending.patientId, pending.familyName, pending.familyPhone, pending.patientName);

    // Notificar o FAMILIAR: confirmação aceita
    await whatsapp.sendTextMessage(
      familyPhone,
      `✅ *Cadastro confirmado, ${familyFirst}!*\n\n` +
      `Você receberá avisos no WhatsApp caso *${patientFirst}* esqueça de confirmar que tomou um medicamento.\n\n` +
      `Obrigado por cuidar da saúde de quem você ama! 💙`,
    );

    // Notificar o PACIENTE: familiar aceitou
    await whatsapp.sendTextMessage(
      pending.patientPhone,
      `✅ *${pending.familyName} aceitou!*\n\n` +
      `Ele(a) será avisado(a) pelo WhatsApp caso você esqueça de confirmar um medicamento. 👨‍👩‍👧\n\n` +
      `Você pode alterar ou remover esse contato a qualquer momento me enviando uma mensagem.`,
    );

    logger.info('Familiar confirmado e salvo com sucesso', {
      patientId: pending.patientId, familyName: pending.familyName,
    });
  } else {
    // Notificar o FAMILIAR: recusa registrada
    await whatsapp.sendTextMessage(
      familyPhone,
      `Tudo bem, ${familyFirst}! 😊\n\n` +
      `Sua recusa foi registrada. Você não receberá mais mensagens do Lembrymed.\n\n` +
      `Caso mude de ideia, peça para *${patientFirst}* te adicionar novamente.`,
    );

    // Notificar o PACIENTE: familiar recusou
    await whatsapp.sendTextMessage(
      pending.patientPhone,
      `ℹ️ *${pending.familyName} recusou o cadastro.*\n\n` +
      `Sem problemas! Você pode cadastrar outro familiar a qualquer momento enviando uma mensagem aqui. 👨‍👩‍👧`,
    );

    logger.info('Familiar recusou o cadastro', {
      patientId: pending.patientId, familyName: pending.familyName,
    });
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER — Salvar ou atualizar familiar no banco
// ═══════════════════════════════════════════════════════════

async function saveFamilyContact(
  patientId: string,
  name: string,
  phone: string,
  patientName: string,
): Promise<boolean> {
  const validPhone = validateFamilyPhone(phone);
  if (!validPhone) {
    logger.warn('Familiar rejeitado: telefone inválido', {
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
    // Buscar familiar ativo ANTES de desativar (para notificá-lo se for diferente do novo)
    const [previousFamily] = await db.query.familyContacts.findMany({
      where: and(eq(familyContacts.patientId, patientId), eq(familyContacts.isActive, true)),
      columns: { name: true, phone: true },
      limit: 1,
    });

    await db.update(familyContacts)
      .set({ isActive: false })
      .where(eq(familyContacts.patientId, patientId));

    await db.insert(familyContacts).values({
      patientId,
      name:     cleanName,
      phone:    validPhone,
      isActive: true,
    });

    // Notificar familiar anterior se for um número diferente do novo
    if (previousFamily && previousFamily.phone !== validPhone) {
      const patientFirst  = patientName.split(' ')[0];
      const prevFirst     = previousFamily.name.split(' ')[0];
      await whatsapp.sendTextMessage(
        previousFamily.phone,
        `Olá, *${prevFirst}*! O paciente *${patientFirst}* atualizou o contato familiar no Lembrymed. ` +
        `Você não receberá mais alertas. Obrigado por ter nos ajudado a cuidar da sua família 💙`,
      ).catch((err: Error) => logger.warn('Falha ao notificar familiar removido', {
        error: err.message, phone: previousFamily.phone.substring(0, 8) + '****',
      }));
      logger.info('Familiar anterior notificado da substituição', {
        patientId, prevName: previousFamily.name, newName: cleanName,
      });
    }

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
    const response = await llmChat([{ role: 'user', content: extractionPrompt }], {
      maxTokens: 1024,
    });

    const rawJson = response.text;

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
  // Buscar TODOS os T+10 do último bloco de horário em BRT hoje.
  //
  // Correção (Onda 3): antes a query tinha LIMIT 1, o que significava que
  // um paciente com 3 medicamentos ao mesmo horário (ex: 08:00) respondendo
  // "SIM" só confirmava 1 medicamento — os outros 2 ficavam sem resposta e
  // disparavam alerta ao familiar indevidamente.
  //
  // Agora: pegamos o `medication_time` do T+10 mais recente e confirmamos
  // TODOS os T+10 daquele horário para o paciente.
  const todayBRT = getTodayBRT();

  const recentReminders = await db.execute(sql`
    WITH last_block AS (
      SELECT medication_time
      FROM reminder_logs
      WHERE patient_id = ${patient.id}::uuid
        AND reminder_type = 't_plus_10'
        AND DATE(scheduled_for AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
      ORDER BY sent_at DESC NULLS LAST
      LIMIT 1
    )
    SELECT rl.id, rl.medication_id, rl.medication_time
    FROM reminder_logs rl
    JOIN last_block lb ON lb.medication_time = rl.medication_time
    WHERE rl.patient_id = ${patient.id}::uuid
      AND rl.reminder_type = 't_plus_10'
      AND DATE(rl.scheduled_for AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
  `);

  if (recentReminders.rows.length === 0) {
    logger.debug('Nenhum lembrete T+10 hoje', { patientId: patient.id });
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
      date:                 todayBRT,
    }).onConflictDoNothing();
  }

  // Métricas de adesão (Redis, TTL 25h)
  const metricKey = status === 'confirmed'
    ? 'lembrymed:metrics:confirmed:24h'
    : 'lembrymed:metrics:denied:24h';
  redis.incr(metricKey).then(() => redis.expire(metricKey, 90_000)).catch(() => {});

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

async function handleLgpdDeletionRequest(patient: { id: string; fullName: string; phone: string }): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de deleção recebido via WhatsApp', { patientId: patient.id });

  // ── Registrar incidente LGPD (Art. 48) ──────────────────────────────────
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 15); // 15 dias corridos (Art. 19 §1º)
  await db.insert(lgpdIncidents).values({
    patientId: patient.id,
    incidentType: 'deletion_request',
    source: 'whatsapp',
    legalDeadline: deadline,
    summary: `Paciente ${patient.fullName} solicitou exclusão de dados via WhatsApp.`,
    metadata: { phone: patient.phone, requestedAt: new Date().toISOString() },
  }).catch((err: Error) => logger.error('Falha ao registrar incidente LGPD', {
    error: err.message, patientId: patient.id,
  }));

  await db.insert(messageLogs).values({
    patientId: patient.id,
    phone: patient.phone,
    direction: 'inbound',
    content: '[LGPD_DELETION_REQUEST]',
    status: 'sent',
  }).catch((err: Error) => logger.warn('Falha ao logar LGPD request', { error: err.message }));

  await whatsapp.sendTextMessage(patient.phone,
    `${firstName}, recebemos sua solicitação de *exclusão dos dados*. 🗂️\\n\\n` +
    `Conforme a LGPD (Lei 13.709/2018), temos até 15 dias para processar. ` +
    `Nossa equipe vai validar e entrar em contato para confirmar.\\n\\n` +
    `Se foi engano, é só responder *CANCELAR* em até 24h. Caso contrário, ` +
    `após a confirmação seus dados serão apagados permanentemente e você ` +
    `não receberá mais lembretes.\\n\\n` +
    `Dúvidas: privacidade@lembrymed.com.br`,
  ).catch((err: Error) => logger.warn('Falha ao responder LGPD', { error: err.message }));

  // Notificar admin
  const adminNumber = env.ADMIN_WHATSAPP;
  if (adminNumber) {
    await whatsapp.sendTextMessage(adminNumber,
      `⚠️ LGPD — pedido de EXCLUSÃO de dados recebido\\n\\n` +
      `Paciente: ${patient.fullName}\\n` +
      `Telefone: ${patient.phone}\\n` +
      `ID: ${patient.id}\\n\\n` +
      `Abra /admin/patient/${patient.phone} para revisar e deletar se apropriado.`,
    ).catch(() => {});
  }
}

async function handleLgpdExportRequest(patient: { id: string; fullName: string; phone: string }): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de exportação recebido via WhatsApp', { patientId: patient.id });

  // ── Registrar incidente LGPD (Art. 48) ──────────────────────────────────
  await db.insert(lgpdIncidents).values({
    patientId: patient.id,
    incidentType: 'export_request',
    source: 'whatsapp',
    legalDeadline: null, // sem prazo legal fixo (Art. 19 §2º: "até 15 dias")
    summary: `Paciente ${patient.fullName} solicitou exportação de dados via WhatsApp.`,
    metadata: { phone: patient.phone, requestedAt: new Date().toISOString() },
  }).catch((err: Error) => logger.error('Falha ao registrar incidente LGPD (export)', {
    error: err.message, patientId: patient.id,
  }));

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
  const adminNumber = env.ADMIN_WHATSAPP;
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
