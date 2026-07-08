/**
 * @module Worker — Medication Review (Check-in 30 dias)
 * @description A cada 30 dias, pergunta ao paciente se houve alguma alteração
 * nos medicamentos. Resposta SIM → entra em fluxo de atualização. Resposta NÃO →
 * envia orientação sobre como proceder em caso de alteração futura.
 *
 * SCHEDULING: Roda diariamente às 10:00 BRT.
 * COOLDOWN: Redis TTL 30 dias por paciente — garante 1 pergunta por mês.
 * ELIGIBILIDADE: Paciente ativo + assinatura active + cadastrado há ≥30 dias +
 *                não está em outro fluxo conversacional.
 */

import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../config/redis';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';
import { getNowBRT } from '../lib/brt';

const MED_REVIEW_FLAG = 'med_review';
const REDIS_TTL_30D   = 30 * 24 * 60 * 60; // 30 dias em segundos

// getNowBRT vive em ../lib/brt (centralizado na Onda 2).

let reviewRunning = false;

async function runMedReviewTick(): Promise<void> {
  if (reviewRunning) return;
  reviewRunning = true;

  try {
    const nowBRT = getNowBRT();
    const hour   = nowBRT.getHours();
    const minute = nowBRT.getMinutes();

    // Dispara apenas 10:00 BRT (janela de 2 min para absorver variação do setInterval)
    if (hour !== 10 || minute >= 2) return;

    const result = await db.execute(sql`
      SELECT
        p.id,
        p.full_name,
        p.phone,
        p.interaction_mode,
        p.created_at::text as created_at_iso
      FROM patients p
      JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
      WHERE p.is_active = true
        AND p.onboarding_step = 'active'
        AND p.created_at < NOW() - INTERVAL '30 days'
    `);

    if (result.rows.length === 0) return;

    const whatsapp = new WhatsAppClient();
    let sent = 0;

    for (const row of result.rows as any[]) {
      // Pula se paciente está em outro fluxo conversacional ativo
      if (row.interaction_mode && row.interaction_mode !== MED_REVIEW_FLAG) {
        logger.debug('Med review pulado: paciente em outro fluxo', {
          patientId: row.id, currentMode: row.interaction_mode,
        });
        continue;
      }

      // Cooldown: não pergunta se foi enviado nos últimos 30 dias
      const cooldownKey = `lembrymed:med_review:last:${row.id}`;
      const lastSent    = await redis.get(cooldownKey);
      if (lastSent) continue;

      const firstName = ((row.full_name as string) || 'Paciente').split(' ')[0];
      const message =
        `Olá, ${firstName}! 👋\n\n` +
        `Faz 30 dias desde a última conferência da sua lista de medicamentos.\n\n` +
        `📋 *Houve alguma alteração nos seus remédios?*\n` +
        `(Mudança de dose, novo medicamento, parou algum, etc.)\n\n` +
        `Responda *SIM* ou *NÃO* 💊`;

      try {
        await whatsapp.sendTextMessage(row.phone, message);

        // Marca paciente em modo de revisão e seta cooldown
        await db.execute(sql`
          UPDATE patients
          SET interaction_mode = ${MED_REVIEW_FLAG}, updated_at = NOW()
          WHERE id = ${row.id}::uuid
        `);
        await redis.set(cooldownKey, '1', 'EX', REDIS_TTL_30D);

        sent++;
        logger.info('Med review check-in sent', {
          patientId: row.id,
          phone: (row.phone as string).substring(0, 8) + '****',
        });
      } catch (err: any) {
        logger.error('Falha ao enviar check-in de revisão', {
          patientId: row.id, error: err.message,
        });
      }
    }

    if (sent > 0) {
      logger.info('Med review check-ins dispatched', { count: sent });
    }
  } catch (err: any) {
    logger.error('runMedReviewTick error', { error: err.message });
  } finally {
    reviewRunning = false;
  }
}

export function startMedicationReviewWorker(): void {
  runMedReviewTick().catch((err) =>
    logger.error('Med review tick error', { error: err.message }),
  );
  setInterval(() => {
    runMedReviewTick().catch((err) =>
      logger.error('Med review tick error', { error: err.message }),
    );
  }, 60_000);

  logger.info('Medication review worker started (daily @ 10:00 BRT, cooldown 30d)');
}
