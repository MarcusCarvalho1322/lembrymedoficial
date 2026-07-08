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

const TEMPLATES = {
  t_minus_30: (name: string, dosage: string) =>
    `⏰ Daqui 30 minutos é hora de tomar sua ${name} ${dosage}. Prepare-se! 💊`,
  t_minus_5: (name: string, dosage: string) =>
    `💊 Em 5 minutos:\nTome sua ${name} ${dosage}!`,
  t_plus_5: (name: string, dosage: string) =>
    `Você tomou sua ${name} ${dosage}?\nResponda SIM ou NÃO 💊`,
};

export function startReminderSender() {
  const whatsapp = new WhatsAppClient();

  const worker = new Worker<ReminderJobData>('send-reminder', async (job) => {
    // Ignorar o tick do scheduler
    if (job.name === 'scheduler-tick') return;

    const { patient_phone, medication_name, dosage, reminder_type,
            patient_id, medication_id, medication_time, scheduled_for_iso } = job.data;

    const message = TEMPLATES[reminder_type](medication_name, dosage);

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

      // Se é T+5, agendar verificação de resposta em 30 min
      if (reminder_type === 't_plus_5') {
        await familyAlertQueue.add(`family-check-${patient_id}`, {
          patient_id,
          medication_id,
          medication_time,
        }, { delay: 30 * 60 * 1000 }); // 30 minutos
      }

      logger.info('Reminder sent', { patient_phone, reminder_type, medication_name });

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

      logger.error('Reminder send failed', { patient_phone, error: error.message });
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
