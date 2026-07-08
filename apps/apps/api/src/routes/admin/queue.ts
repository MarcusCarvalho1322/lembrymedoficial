/**
 * @module Admin — Monitoramento da Fila BullMQ + Reenvio Manual
 * @description Status em tempo real das filas de envio, histórico de erros
 * e capacidade de reenvio manual de lembretes com falha.
 */

import { Router } from 'express';
import { sendReminderQueue, familyAlertQueue } from '../../config/queues';
import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../../config/redis';
import { WhatsAppClient } from '../../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';

const router = Router();

router.get('/admin/queue', async (_req, res) => {
  try {
    const metricKeys = [
      'lembrymed:metrics:sent:24h',
      'lembrymed:metrics:failed:24h',
      'lembrymed:metrics:confirmed:24h',
      'lembrymed:metrics:denied:24h',
    ];

    const [reminderCounts, familyCounts, metricValues] = await Promise.all([
      sendReminderQueue.getJobCounts(),
      familyAlertQueue.getJobCounts(),
      redis.mget(...metricKeys).catch(() => [null, null, null, null]),
    ]);

    const sent      = Number(metricValues[0] ?? 0);
    const failed    = Number(metricValues[1] ?? 0);
    const confirmed = Number(metricValues[2] ?? 0);
    const denied    = Number(metricValues[3] ?? 0);

    res.json({
      reminders: {
        active:    reminderCounts.active    || 0,
        waiting:   reminderCounts.waiting   || 0,
        completed: reminderCounts.completed || 0,
        failed:    reminderCounts.failed    || 0,
        delayed:   reminderCounts.delayed   || 0,
      },
      familyAlerts: {
        active:    familyCounts.active    || 0,
        waiting:   familyCounts.waiting   || 0,
        completed: familyCounts.completed || 0,
        failed:    familyCounts.failed    || 0,
        delayed:   familyCounts.delayed   || 0,
      },
      delivery: {
        sent_24h:      sent,
        failed_24h:    failed,
        confirmed_24h: confirmed,
        denied_24h:    denied,
        delivery_rate: sent > 0 ? Math.round(((sent - failed) / sent) * 100) : null,
        confirm_rate:  sent > 0 ? Math.round((confirmed / sent) * 100)         : null,
      },
      circuit_breaker: WhatsAppClient.getCircuitState(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Limpar jobs falhos */
router.post('/admin/queue/clean-failed', async (_req, res) => {
  try {
    await sendReminderQueue.clean(0, 100, 'failed');
    await familyAlertQueue.clean(0, 100, 'failed');
    res.json({ success: true, message: 'Jobs falhos removidos' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Drena TODAS as filas BullMQ — remove jobs em todos os estados
 * (waiting, active, completed, failed, delayed, paused).
 *
 * Uso: resetar o ambiente para testar do zero depois de apagar
 * pacientes do banco. Sem isso, workers tentam processar jobs
 * órfãos cujo paciente não existe mais → logs poluídos.
 *
 * IMPORTANTE: operação destrutiva. Só usar em dev/teste.
 */
router.post('/admin/queue/drain-all', async (_req, res) => {
  try {
    const states: Array<'wait' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused'> = [
      'wait', 'active', 'completed', 'failed', 'delayed', 'paused',
    ];

    const before = {
      reminders: await sendReminderQueue.getJobCounts(),
      familyAlerts: await familyAlertQueue.getJobCounts(),
    };

    // .drain() remove waiting + delayed. .clean(0, 10000, state) remove por estado.
    await sendReminderQueue.drain(true); // também limpa delayed
    await familyAlertQueue.drain(true);

    for (const state of states) {
      try {
        await sendReminderQueue.clean(0, 10000, state as any);
        await familyAlertQueue.clean(0, 10000, state as any);
      } catch {
        // alguns estados podem não ser drenáveis via clean — OK
      }
    }

    // obliterate remove TUDO (inclusive metadados da fila) — mais agressivo.
    // Não usamos aqui para preservar a configuração da queue.

    const after = {
      reminders: await sendReminderQueue.getJobCounts(),
      familyAlerts: await familyAlertQueue.getJobCounts(),
    };

    res.json({ success: true, before, after });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/queue/errors — histórico de envios com falha ─────────────────

router.get('/admin/queue/errors', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const since = req.query.since as string | undefined; // ISO date string

    const errors = await db.execute(sql`
      SELECT
        rl.id,
        rl.patient_id,
        p.full_name   as patient_name,
        p.phone       as patient_phone,
        m.name        as medication_name,
        m.dosage,
        rl.reminder_type,
        rl.medication_time,
        rl.scheduled_for,
        rl.error_message,
        rl.created_at
      FROM reminder_logs rl
      JOIN patients p   ON p.id = rl.patient_id
      JOIN medications m ON m.id = rl.medication_id
      WHERE rl.status = 'failed'
        ${since ? sql`AND rl.created_at >= ${since}::timestamptz` : sql``}
      ORDER BY rl.created_at DESC
      LIMIT ${limit}
    `);

    res.json({
      count: errors.rows.length,
      errors: errors.rows,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── POST /admin/queue/resend — reenvio manual de lembrete ───────────────────

router.post('/admin/queue/resend', async (req, res) => {
  const { reminder_log_id } = req.body;

  if (!reminder_log_id || typeof reminder_log_id !== 'string') {
    return res.status(400).json({ error: 'reminder_log_id é obrigatório' });
  }

  try {
    // Buscar o log de lembrete falho com dados do paciente e medicamento
    const logResult = await db.execute(sql`
      SELECT
        rl.id,
        rl.reminder_type,
        rl.medication_time,
        rl.scheduled_for,
        p.id   as patient_id,
        p.phone as patient_phone,
        p.full_name as patient_name,
        m.id   as medication_id,
        m.name as medication_name,
        m.dosage
      FROM reminder_logs rl
      JOIN patients p   ON p.id = rl.patient_id
      JOIN medications m ON m.id = rl.medication_id
      WHERE rl.id = ${reminder_log_id}::uuid
      LIMIT 1
    `);

    if (logResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lembrete não encontrado' });
    }

    const log = logResult.rows[0] as any;

    // Montar mensagem usando o template original
    const { buildReminderMessage } = await import('../../lib/reminder-templates');
    const message = buildReminderMessage(
      log.reminder_type,
      log.medication_name,
      log.dosage,
      log.medication_time,
    );

    // Enviar via WhatsApp
    const whatsapp = new WhatsAppClient();
    const result = await whatsapp.sendTextMessage(log.patient_phone, message);

    // Registrar novo log de envio bem-sucedido
    await db.execute(sql`
      INSERT INTO reminder_logs (patient_id, medication_id, reminder_type, medication_time, scheduled_for, status, sent_at, whatsapp_message_id)
      VALUES (
        ${log.patient_id}::uuid,
        ${log.medication_id}::uuid,
        ${log.reminder_type},
        ${log.medication_time}::time,
        NOW(),
        'sent',
        NOW(),
        ${result.messages?.[0]?.id ?? null}
      )
    `);

    logger.info('Admin manual resend', {
      reminder_log_id,
      patient: log.patient_name,
      type: log.reminder_type,
    });

    return res.json({
      success: true,
      message: `Lembrete reenviado para ${log.patient_phone}`,
      message_id: result.messages?.[0]?.id,
    });

  } catch (error: any) {
    logger.error('Admin resend failed', { reminder_log_id, error: error.message });
    return res.status(500).json({ error: error.message });
  }
});

// ─── GET /admin/onboarding-funnel — visão do funil de onboarding ─────────────

router.get('/admin/onboarding-funnel', async (_req, res) => {
  try {
    const funnel = await db.execute(sql`
      SELECT
        onboarding_step,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d
      FROM patients
      WHERE is_active = true OR onboarding_step != 'active'
      GROUP BY onboarding_step
      ORDER BY
        CASE onboarding_step
          WHEN 'start'               THEN 1
          WHEN 'collecting_meds'     THEN 2
          WHEN 'meds_confirmed'      THEN 3
          WHEN 'collecting_family'   THEN 4
          WHEN 'active'              THEN 5
          ELSE 6
        END
    `);

    // Pacientes que chegaram ao onboarding mas nunca completaram (>48h sem avançar)
    const stuckResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM patients
      WHERE onboarding_step != 'active'
        AND is_active = false
        AND created_at < NOW() - INTERVAL '48 hours'
    `);

    res.json({
      funnel: funnel.rows,
      stuck_count: Number((stuckResult.rows[0] as any)?.count ?? 0),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
