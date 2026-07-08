import { Queue } from 'bullmq';
import { redis } from './redis';

/** Fila de envio de lembretes individuais */
export const sendReminderQueue = new Queue('send-reminder', { connection: redis });

/** Fila de alertas familiares (delayed 30min) */
export const familyAlertQueue = new Queue('family-alert', { connection: redis });

/** Fila de lifecycle (renovações + suspensões) */
export const lifecycleQueue = new Queue('lifecycle', { connection: redis });
