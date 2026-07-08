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

export default router;
