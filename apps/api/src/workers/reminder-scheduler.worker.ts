/**
 * @module Worker — Reminder Scheduler
 * @description CRON BullMQ que roda a cada 1 minuto.
 * Verifica medicamentos com horário próximo e enfileira envios.
 * MISSÃO CRÍTICA — se parar, nenhum lembrete é enviado.
 *
 * TIMEZONE: Medicamentos são cadastrados no horário do paciente (BRT = America/Sao_Paulo).
 * O servidor roda em UTC. Toda comparação de tempo usa BRT para evitar
 * desvio de 3h que ocorreria com comparação direta em UTC.
 *
 * ARQUITETURA DE CUSTO (2026-05):
 * Este worker não faz NENHUMA query ao Neon durante operação normal.
 * Todas as leituras vêm do Redis (med-schedule-cache.ts):
 *   - Lista de medicamentos ativos → Redis (sincronizado no boot + após mutações)
 *   - Dedup de envio "já enviou hoje?" → Redis (setado pelo reminder-sender após envio)
 * O Neon só é consultado quando:
 *   (a) Redis está frio (boot ou restart do Redis)
 *   (b) Uma mutação ocorreu (novo paciente, novo med, renovação, exclusão LGPD)
 * Resultado: Neon Scale to Zero pode ativar durante períodos sem mutações.
 */

import { Worker } from 'bullmq';
import { db, reminderLogs } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';
import { sendReminderQueue } from '../config/queues';
import { logger } from '@lembrymed/shared/logger';
import type { ReminderJobData } from '@lembrymed/shared/types';
import { getNowBRT, getTodayBRT, getBRTOffsetMs } from '../lib/brt';
import { getReminderType, calcDiffMinutes } from '../lib/scheduling';
import {
  getActiveMeds,
  reminderDedupKey,
  isReminderAlreadySent,
} from '../lib/med-schedule-cache';

export async function runSchedulerTick(): Promise<{ enqueued: number }> {
  const nowBRT   = getNowBRT();
  const todayBRT = getTodayBRT();

  const activeMeds = await getActiveMeds();
  let enqueued = 0;

  for (const row of activeMeds) {
    const [hours, minutes] = row.med_time.split(':').map(Number);
    const diffMin      = calcDiffMinutes(hours, minutes, nowBRT);
    const reminderType = getReminderType(diffMin);
    if (!reminderType) continue;

    const dedupKey = reminderDedupKey(row.patient_id, row.medication_id, reminderType, todayBRT);
    if (await isReminderAlreadySent(dedupKey)) continue;

    const medTimeBRT = new Date(nowBRT);
    medTimeBRT.setHours(hours, minutes, 0, 0);
    const brtOffsetMs    = getBRTOffsetMs();
    const scheduledForUtc = new Date(medTimeBRT.getTime() + brtOffsetMs);

    const jobData: ReminderJobData = {
      patient_id:      row.patient_id,
      patient_name:    row.patient_name,
      patient_phone:   row.patient_phone,
      medication_id:   row.medication_id,
      medication_name: row.med_name,
      dosage:          row.dosage,
      medication_time: row.med_time,
      reminder_type:   reminderType as any,
      scheduled_for_iso: scheduledForUtc.toISOString(),
    };

    const jobId = `reminder-${row.patient_id}-${row.medication_id}-${row.med_time}-${reminderType}-${todayBRT}`;
    await sendReminderQueue.add(jobId, jobData, { jobId });
    enqueued++;
  }

  if (enqueued > 0) {
    logger.info('Reminders enqueued', { count: enqueued });
  }
  return { enqueued };
}

export function startReminderScheduler() {
  const worker = new Worker('reminder-scheduler', runSchedulerTick, {
    connection: { url: env.REDIS_URL },
    limiter: { max: 1, duration: 60000 },
  });

  // Agendar como repeatable (CRON a cada 1 minuto)
  sendReminderQueue.add('scheduler-tick', {}, {
    repeat: { every: 60000 },
    jobId: 'reminder-scheduler-cron',
  }).catch(() => {}); // Ignora se já existe

  worker.on('error', (err) => logger.error('Scheduler error', { error: err.message }));
  logger.info('Reminder scheduler started — Redis-only mode (zero Neon queries in steady-state)');

  return worker;
}
