/**
 * @module Webhook Stripe
 * @description Recebe confirmação de pagamento:
 *   1. Criar/atualizar paciente + assinatura no banco (upsert — tolerante a duplicatas)
 *   2. Enviar mensagem WhatsApp de boas-vindas DIRETAMENTE via Z-API
 *   3. Onboarding continua via conversa WhatsApp (Claude messages.create em whatsapp.ts)
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { db, patients, subscriptions, medications, consentLogs } from '@lembrymed/database';
import { eq, and } from 'drizzle-orm';
import { WhatsAppClient } from '../../clients/dialog360.client';
import { redis } from '../../config/redis';
import { logger } from '@lembrymed/shared/logger';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const whatsapp = new WhatsAppClient();

/**
 * Retorna true se o event.id foi processado nas últimas 24h.
 * Usa Redis SET NX TTL 24h para idempotência cross-replica.
 */
async function isDuplicateStripeEvent(eventId: string): Promise<boolean> {
  const key = `lembrymed:stripe:event:${eventId}`;
  const isNew = await redis
    .set(key, '1', 'EX', 86400, 'NX')
    .catch(() => null);
  return !isNew; // isNew === null ou 'OK'; 'OK' = novo; null = erro/duplicata
}

/**
 * Mensagem de boas-vindas enviada imediatamente após pagamento confirmado.
 */
function buildWelcomeMessage(name: string): string {
  const firstName = name.split(' ')[0];
  return (
    `Olá, ${firstName}! 👋\n\n` +
    `Seu pagamento foi confirmado e o *Lembrymed* está ativado! ✅\n\n` +
    `Vou te ajudar a configurar seus lembretes de medicamentos em poucos minutos.\n\n` +
    `Para começar, me diga: *quais medicamentos você toma atualmente?*\n\n` +
    `Pode me enviar a lista ou uma foto da receita 📋`
  );
}

router.post('/webhook/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    logger.error('Stripe webhook verification failed', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotência: Stripe pode reentregar o mesmo event.id em caso de falha.
  // Sem este guard, criávamos subscriptions duplicadas (ou reenviávamos o
  // WhatsApp de boas-vindas). Usamos Redis SET NX TTL 24h.
  if (await isDuplicateStripeEvent(event.id)) {
    logger.info('Stripe webhook duplicado ignorado (idempotência)', { eventId: event.id, type: event.type });
    return res.json({ received: true, duplicate: true });
  }

  // Responder imediatamente ao Stripe (evita retries) — só DEPOIS do dedup
  res.json({ received: true });

  if (event.type !== 'checkout.session.completed') return;

  const session = event.data.object as Stripe.Checkout.Session;

  // ── Detectar tipo de pagamento: renovação ou novo cadastro ────────────────
  const isRenewal   = session.metadata?.type === 'renewal';
  const patientIdMeta = session.metadata?.patientId;

  if (isRenewal && patientIdMeta) {
    await handleRenewal(session, patientIdMeta);
    return;
  }

  // ── Novo paciente ─────────────────────────────────────────────────────────
  const phone = session.metadata?.phone;
  const name  = session.metadata?.name;
  const email = session.customer_email;

  if (!phone || !name) {
    logger.error('Missing metadata in Stripe session (not renewal, not new)', { sessionId: session.id, metadata: session.metadata });
    return;
  }

  logger.info('Processing checkout.session.completed (new patient)', { name, phone, sessionId: session.id });

  // ─── PASSO 1: Criar/atualizar paciente (tolerante a duplicatas) ───────────
  let patientId: string;
  try {
    // Tenta inserir; se o telefone já existir (pagamento repetido/teste), atualiza
    const result = await db
      .insert(patients)
      .values({
        fullName: name,
        email: email || undefined,
        phone,
        onboardingStep: 'welcome_sent',
      })
      .onConflictDoUpdate({
        target: patients.phone,
        set: {
          fullName: name,
          email: email || undefined,
          onboardingStep: 'welcome_sent',
          updatedAt: new Date(),
        },
      })
      .returning();

    patientId = result[0].id;
    logger.info('Patient upserted', { patientId, phone });

    // ─── Registrar consentimento LGPD ────────────────────────────────────────
    // Metadata foi injetada pelo /api/checkout (apps/web). Se ausente, usamos
    // versão default para não quebrar fluxo antigo.
    const consentVersion = session.metadata?.consentVersion || 'v1.0-2026-04-22';
    await db.insert(consentLogs).values({
      patientId,
      phone,
      policyVersion: consentVersion,
      consentType: 'privacy',
      source: 'checkout',
      ipAddress: session.metadata?.consentIp || null,
      userAgent: session.metadata?.consentUserAgent || null,
    }).catch((err: Error) =>
      logger.warn('Falha ao registrar consent_log (fluxo continua)', {
        error: err.message, patientId,
      }),
    );

    // Subscription — ignora se já existe para este paymentIntent
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await db
      .insert(subscriptions)
      .values({
        patientId,
        stripeCustomerId: session.customer as string,
        stripePaymentIntentId: session.payment_intent as string,
        amountCents: session.amount_total || 14900,
        status: 'active',
        startsAt: new Date(),
        expiresAt,
      })
      .onConflictDoNothing();

    logger.info('Subscription recorded', { patientId });
  } catch (error: any) {
    logger.error('CRITICAL: Failed to upsert patient/subscription', {
      error: error.message,
      stack: error.stack,
      phone,
      name,
    });
    return;
  }

  // ─── PASSO 2: Enviar WhatsApp de boas-vindas DIRETAMENTE ─────────────────
  try {
    const welcomeMsg = buildWelcomeMessage(name);
    const result = await whatsapp.sendTextMessage(phone, welcomeMsg);
    logger.info('WhatsApp welcome sent', {
      phone,
      messageId: result.messages?.[0]?.id,
    });

    await db.update(patients)
      .set({ onboardingStep: 'welcome_sent' })
      .where(eq(patients.id, patientId));
  } catch (error: any) {
    logger.error('Failed to send WhatsApp welcome', {
      error: error.message,
      phone,
    });
  }

  // ─── PASSO 3: Onboarding via WhatsApp ────────────────────────────────────
  // O onboarding continua automaticamente quando o paciente responder o WhatsApp.
  // O webhook /webhook/whatsapp usa Claude (messages.create) para conduzir a conversa.
  logger.info('Stripe webhook processado com sucesso — aguardando resposta do paciente no WhatsApp', {
    patientId,
    phone,
  });
});

// ═══════════════════════════════════════════════════════════
// RENOVAÇÃO — paciente suspenso paga novamente
// ═══════════════════════════════════════════════════════════

/**
 * Processa renovação de assinatura para paciente já cadastrado.
 * Chamado quando metadata.type === 'renewal' (links gerados pelo lifecycle.worker).
 *
 * Fluxo:
 *  1. Buscar paciente por ID
 *  2. Criar nova assinatura ativa com vencimento em 1 ano
 *  3. Reativar medicamentos desativados pela suspensão
 *  4. Enviar mensagem WhatsApp de confirmação
 *  5. NÃO reinicia onboarding — paciente já tem medicamentos cadastrados
 */
async function handleRenewal(
  session: Stripe.Checkout.Session,
  patientId: string,
): Promise<void> {
  logger.info('Processando renovação de assinatura', { patientId, sessionId: session.id });

  // Buscar paciente
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, patientId),
  });

  if (!patient) {
    logger.error('Paciente não encontrado para renovação', { patientId, sessionId: session.id });
    return;
  }

  try {
    // 1. Criar nova assinatura ativa (1 ano a partir de hoje)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await db
      .insert(subscriptions)
      .values({
        patientId,
        stripeCustomerId:      session.customer as string || '',
        stripePaymentIntentId: session.payment_intent as string || session.id,
        amountCents:           session.amount_total || 14900,
        status:                'active',
        startsAt:              new Date(),
        expiresAt,
      })
      .onConflictDoNothing(); // Segurança contra webhook duplicado

    logger.info('Nova assinatura criada após renovação', { patientId, expiresAt });

    // 2. Reativar medicamentos que foram desativados pela suspensão
    const reactivated = await db
      .update(medications)
      .set({ isActive: true, updatedAt: new Date() })
      .where(and(
        eq(medications.patientId, patientId),
        eq(medications.isActive, false),
      ))
      .returning();

    logger.info('Medicamentos reativados após renovação', {
      patientId, count: reactivated.length,
    });

    // 3. Garantir que paciente está ativo (caso tenha sido suspenso de outro jeito)
    await db.update(patients)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(patients.id, patientId));

    // 4. Enviar WhatsApp de confirmação (NÃO é onboarding — paciente já configurado)
    const firstName       = patient.fullName.split(' ')[0];
    const expiryFormatted = expiresAt.toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const renewalMsg =
      `${firstName}, que ótimo! 🎉 Sua assinatura do *Lembrymed* foi renovada com sucesso!\n\n` +
      `Seus lembretes de medicamentos voltam a funcionar agora. ✅\n\n` +
      `Validade: *${expiryFormatted}*\n\n` +
      `Sentimos sua falta! 💊 Qualquer dúvida, é só me chamar.`;

    await whatsapp.sendTextMessage(patient.phone, renewalMsg);
    logger.info('Mensagem de renovação enviada', { patientId, phone: patient.phone });

  } catch (error: any) {
    logger.error('CRÍTICO: Falha ao processar renovação', {
      error: error.message, stack: error.stack, patientId,
    });
  }
}

export default router;
