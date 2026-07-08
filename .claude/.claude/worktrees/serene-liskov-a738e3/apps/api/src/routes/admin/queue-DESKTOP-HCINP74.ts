/**
 * @module Admin — Monitoramento da Fila BullMQ
 * @description Status em tempo real das filas de envio.
 */

import { Router } from 'express';
import { sendReminderQueue, familyAlertQueue } from '../../config/queues';

const router = Router();

router.get('/admin/queue', async (_req, res) => {
  try {
    const [reminderCounts, familyCounts] = await Promise.all([
      sendReminderQueue.getJobCounts(),
      familyAlertQueue.getJobCounts(),
    ]);

    res.json({
      reminders: {
        active: reminderCounts.active || 0,
        waiting: reminderCounts.waiting || 0,
        completed: reminderCounts.completed || 0,
        failed: reminderCounts.failed || 0,
        delayed: reminderCounts.delayed || 0,
      },
      familyAlerts: {
        active: familyCounts.active || 0,
        waiting: familyCounts.waiting || 0,
        completed: familyCounts.completed || 0,
        failed: familyCounts.failed || 0,
        delayed: familyCounts.delayed || 0,
      },
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

export default router;
