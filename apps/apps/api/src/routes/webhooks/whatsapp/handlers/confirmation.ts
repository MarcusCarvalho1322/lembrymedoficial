/**
 * @module Webhook WhatsApp — Handler de confirmação SIM/NÃO de lembrete
 *
 * Quando o paciente ativo responde SIM/NÃO depois do T+10, registramos
 * confirmações para TODOS os medicamentos do mesmo bloco de horário.
 *
 * "Bloco de horário" = todos os medicamentos do paciente cujo `medication_time`
 * coincide. Sem isso, paciente com 3 meds às 08:00 confirmaria só 1 e os
 * outros 2 disparariam alerta ao familiar indevidamente (corrigido na Onda 3).
 */

import { db, medicationConfirmations } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../../../../config/redis';
import { logger } from '@lembrymed/shared/logger';
import { WhatsAppClient } from '../../../../clients/dialog360.client';
import { getTodayBRT } from '../../../../lib/brt';

const whatsapp = new WhatsAppClient();

export async function handleConfirmation(
  patient: { id: string; fullName: string; phone: string },
  status: 'confirmed' | 'denied',
): Promise<void> {
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

  // Métricas Redis (TTL 25h)
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
