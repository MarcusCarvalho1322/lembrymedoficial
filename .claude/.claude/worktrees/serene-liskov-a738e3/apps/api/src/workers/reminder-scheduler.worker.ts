/**
 * @module Worker — Reminder Scheduler
 * @description CRON BullMQ que roda a cada 1 minuto.
 * Verifica medicamentos com horário próximo e enfileira envios.
 * MISSÃO CRÍTICA — se parar, nenhum lembrete é enviado.
 *
 * TIMEZONE: Medicamentos são cadastrados no horário do paciente (BRT = America/Sao_Paulo).
 * O servidor roda em UTC. Toda comparação de tempo usa BRT para evitar
 * desvio de 3h que ocorreria com comparação direta em UTC.
 */

import { Worker } from 'bullmq';
import { db, patients, medications, subscriptions, reminderLogs, eq, and } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../config/redis';
import { sendReminderQueue } from '../config/queues';
import { logger } from '@lembrymed/shared/logger';
import type { ReminderJobData } from '@lembrymed/shared/types';

/**
 * Retorna o Date atual convertido para o timezone do Brasil (BRT = UTC-3, com DST automático).
 * Usa Intl.DateTimeFormat para conversão correta via IANA tz database.
 */
function getNowBRT(): Date {
  const now = new Date();
  // toLocaleString com timeZone retorna a string na hora local do Brasil.
  // new Date() dessa string cria um objeto Date cujas propriedades getHours/getMinutes
  // refletem o horário de Brasília, permitindo comparação direta com HH:MM dos medicamentos.
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/**
 * Retorna a data atual no formato YYYY-MM-DD no timezone de Brasília.
 * Evita o bug de cruzamento de meia-noite onde UTC já virou para o dia seguinte
 * mas BRT ainda está no dia anterior (ocorre de 21:00 a 00:00 BRT).
 */
function getTodayBRT(): string {
  const now = new Date();
  return new Intl.DateTimeFormat('en-CA', { // en-CA gera YYYY-MM-DD
    timeZone: 'America/Sao_Paulo',
  }).format(now);
}

/**
 * Inicializa o worker de scheduling de lembretes
 */
export function startReminderScheduler() {
  const worker = new Worker('reminder-scheduler', async () => {
    // Hora atual em BRT — usada para comparar com os horários cadastrados pelos pacientes
    const nowBRT = getNowBRT();
    const todayBRT = getTodayBRT(); // Ex: "2025-08-15"

    // Buscar todos os medicamentos ativos com assinatura ativa
    const activeMeds = await db.execute(sql`
      SELECT
        p.id as patient_id, p.full_name as patient_name, p.phone as patient_phone,
        m.id as medication_id, m.name as med_name, m.dosage,
        unnest(m.times) as med_time
      FROM patients p
      JOIN medications m ON m.patient_id = p.id AND m.is_active = true
      JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
      WHERE p.is_active = true
        AND p.onboarding_step = 'active'
    `);

    let enqueued = 0;

    for (const row of activeMeds.rows as any[]) {
      const [hours, minutes] = row.med_time.split(':').map(Number);

      // Construir o horário do medicamento HOJE no BRT
      // Usa nowBRT como base para que setHours opere no contexto correto
      const medTimeBRT = new Date(nowBRT);
      medTimeBRT.setHours(hours, minutes, 0, 0);

      // diffMin: positivo = medicamento ainda não chegou, negativo = já passou
      const diffMin = (medTimeBRT.getTime() - nowBRT.getTime()) / 60000;

      let reminderType: string | null = null;
      if (diffMin >= 25 && diffMin <= 35)  reminderType = 't_minus_30';
      else if (diffMin >= 0 && diffMin <= 10) reminderType = 't_minus_5';
      else if (diffMin >= -10 && diffMin <= -3) reminderType = 't_plus_5';

      if (!reminderType) continue;

      // Verificar duplicata — já enviou hoje (BRT)?
      // CURRENT_DATE no PostgreSQL é UTC; usamos o todayBRT calculado em Node
      // para evitar bug de cruzamento de meia-noite entre UTC e BRT.
      const existing = await db.execute(sql`
        SELECT id FROM reminder_logs
        WHERE patient_id = ${row.patient_id}::uuid
          AND medication_id = ${row.medication_id}::uuid
          AND reminder_type = ${reminderType}
          AND medication_time = ${row.med_time}::time
          AND DATE(created_at AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
        LIMIT 1
      `);

      if (existing.rows.length > 0) continue;

      // Enfileirar para envio
      // `scheduled_for` = horário planejado do medicamento HOJE em UTC,
      // para que o consumer possa preencher a coluna sem precisar recalcular.
      const scheduledForUtc = new Date(
        Date.UTC(
          medTimeBRT.getFullYear(),
          medTimeBRT.getMonth(),
          medTimeBRT.getDate(),
          medTimeBRT.getHours() + 3, // BRT é UTC-3
          medTimeBRT.getMinutes(),
          0,
          0,
        ),
      );

      const jobData: ReminderJobData = {
        patient_id: row.patient_id,
        patient_name: row.patient_name,
        patient_phone: row.patient_phone,
        medication_id: row.medication_id,
        medication_name: row.med_name,
        dosage: row.dosage,
        medication_time: row.med_time,
        reminder_type: reminderType as any,
        scheduled_for_iso: scheduledForUtc.toISOString(),
      };

      // jobId determinístico = dedup BullMQ gratuito. Se o scheduler
      // disparar 2x no mesmo tick BRT, a segunda tentativa é rejeitada.
      const jobId = `reminder-${row.patient_id}-${row.medication_id}-${row.med_time}-${reminderType}-${todayBRT}`;

      await sendReminderQueue.add(jobId, jobData, { jobId });
      enqueued++;
    }

    if (enqueued > 0) {
      logger.info('Reminders enqueued', { count: enqueued });
    }
  }, {
    connection: redis,
    limiter: { max: 1, duration: 60000 },
  });

  // Agendar como repeatable (CRON a cada 1 minuto)
  sendReminderQueue.add('scheduler-tick', {}, {
    repeat: { every: 60000 },
    jobId: 'reminder-scheduler-cron',
  }).catch(() => {}); // Ignora se já existe

  worker.on('error', (err) => logger.error('Scheduler error', { error: err.message }));
  logger.info('Reminder scheduler started (timezone: America/Sao_Paulo)');

  return worker;
}
