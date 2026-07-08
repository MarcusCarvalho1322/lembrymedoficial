/**
 * @module Worker — Reminder Sender
 * @description Processa fila de envio de lembretes individuais via 360dialog.
 * Concurrency=10 para enviar em paralelo. Rate-limited a 50/s.
 */

import { Worker } from 'bullmq';
import { db, reminderLogs, messageLogs } from '@lembrymed/database';
import { redis } from '../config/redis';
import { familyAlertQueue } from '../config/queues';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';
import type { ReminderJobData } from '@lembrymed/shared/types';
import { REMINDER_TEMPLATES as TEMPLATES, buildReminderMessage, shouldTriggerFamilyAlert } from '../lib/reminder-templates';
import { reminderDedupKey, markReminderSent } from '../lib/med-schedule-cache';
import { getTodayBRT } from '../lib/brt';

export function startReminderSender() {
  const whatsapp = new WhatsAppClient();

  const worker = new Worker<ReminderJobData>('send-reminder', async (job) => {
    // Ignorar o tick do scheduler
    if (job.name === 'scheduler-tick') return;

    const { patient_phone, medication_name, dosage, reminder_type,
            patient_id, medication_id, medication_time, scheduled_for_iso } = job.data;

    // Guard: tipo desconhecido nunca deve chegar aqui, mas se chegar o worker
    // não pode crashar — buildReminderMessage retorna mensagem genérica de fallback.
    if (!TEMPLATES[reminder_type]) {
      logger.warn('Unknown reminder_type — using fallback message', { reminder_type, patient_phone: patient_phone.substring(0, 8) + '****' });
    }
    const message = buildReminderMessage(reminder_type, medication_name, dosage, medication_time);

    // Horário planejado do medicamento (quando DEVERIA ter sido enviado).
    // Fallback para new Date() se job vier de versão antiga do scheduler.
    const scheduledFor = scheduled_for_iso ? new Date(scheduled_for_iso) : new Date();

    try {
      const result = await whatsapp.sendTextMessage(patient_phone, message);

      // Registrar lembrete enviado
      await db.insert(reminderLogs).values({
        patientId: patient_id,
        medicationId: medication_id,
        reminderType: reminder_type,
        medicationTime: medication_time,
        scheduledFor, // ← agora reflete horário planejado, não momento do envio
        status: 'sent',
        sentAt: new Date(),
        whatsappMessageId: result.messages?.[0]?.id,
      });

      // Registrar no log de mensagens
      await db.insert(messageLogs).values({
        patientId: patient_id,
        phone: patient_phone,
        direction: 'outbound',
        content: message,
        whatsappMessageId: result.messages?.[0]?.id,
        status: 'sent',
      });

      // Se é confirmação (T+10 novo ou T+5 legado), agendar verificação em 30 min
      if (shouldTriggerFamilyAlert(reminder_type)) {
        await familyAlertQueue.add(`family-check-${patient_id}`, {
          patient_id,
          medication_id,
          medication_time,
        }, { delay: 30 * 60 * 1000 }); // 30 minutos
      }

      // ── Dedup Redis: sinalizar que este lembrete já foi enviado hoje ────────
      // O reminder-scheduler checa esta chave antes de enfileirar novos jobs.
      // Isso elimina a necessidade do scheduler fazer SELECT em reminder_logs no Neon.
      const todayBRT = getTodayBRT();
      const dedupKey = reminderDedupKey(patient_id, medication_id, reminder_type, todayBRT);
      await markReminderSent(dedupKey);

      // Métricas de entrega (Redis, TTL 25h para cobertura de 24h com margem)
      const metricKey = 'lembrymed:metrics:sent:24h';
      redis.incr(metricKey).then(() => redis.expire(metricKey, 90_000)).catch(() => {});

      logger.info('Reminder sent', { patient_phone: patient_phone.substring(0, 8) + '****', reminder_type, medication_name });

    } catch (error: any) {
      // Registrar falha
      await db.insert(reminderLogs).values({
        patientId: patient_id,
        medicationId: medication_id,
        reminderType: reminder_type,
        medicationTime: medication_time,
        scheduledFor, // mesma semântica: horário PLANEJADO
        status: 'failed',
        errorMessage: error.message,
      });

      // Métrica de falha
      const failKey = 'lembrymed:metrics:failed:24h';
      redis.incr(failKey).then(() => redis.expire(failKey, 90_000)).catch(() => {});

      logger.error('Reminder send failed', { patient_phone: patient_phone.substring(0, 8) + '****', error: error.message });
      throw error; // BullMQ retry automático
    }
  }, {
    connection: redis,
    concurrency: 10,
    limiter: { max: 50, duration: 1000 },
  });

  worker.on('error', (err) => logger.error('Sender error', { error: err.message }));
  logger.info('Reminder sender started');

  return worker;
}
