import { Queue } from 'bullmq';
import { env } from './env';

/**
 * Fila de envio de lembretes individuais.
 *
 * Backoff exponencial: 3 tentativas (5s → 30s → 150s). Evita storm de retries
 * quando o provedor WhatsApp está instável. O circuit breaker no WhatsAppClient
 * protege chamadas em cascata.
 *
 * IMPORTANTE: `defaultJobOptions` deve viver aqui (na Queue), não no Worker —
 * em BullMQ v5, opções no Worker são ignoradas silenciosamente.
 */
export const sendReminderQueue = new Queue('send-reminder', {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

/** Fila de alertas familiares (delayed 30min) */
export const familyAlertQueue = new Queue('family-alert', {
  connection: { url: env.REDIS_URL },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

// NOTE: lifecycleQueue removida — lifecycle.worker.ts usa node-cron diretamente,
// não BullMQ. Manter a Queue criaria uma conexão Redis desnecessária e poderia
// confundir monitoramento via BullMQ Board.
