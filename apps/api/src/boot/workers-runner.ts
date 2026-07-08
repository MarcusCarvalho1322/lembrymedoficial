/**
 * @module Bootstrap — Workers BullMQ + crons
 *
 * Inicia somente os 8 workers (sem Express). Adiciona um HTTP server mínimo
 * em `PORT` (fallback `WORKERS_HEALTH_PORT`, default 3001) com endpoint `/health` para o
 * Railway poder monitorar o processo.
 *
 * Justificativa (Onda 3.17): rodar workers no mesmo processo da API era um
 * SPOF — bug em rota Express derrubava também os disparos de lembretes.
 * Separação custa ~$15-20/mês adicional no Railway mas elimina o acoplamento.
 */

import http from 'http';
import { env } from '../config/env';
import { logger } from '@lembrymed/shared/logger';
import { redis } from '../config/redis';

import { startReminderScheduler } from '../workers/reminder-scheduler.worker';
import { startReminderSender }    from '../workers/reminder-sender.worker';
import { startFamilyAlerter }     from '../workers/family-alerter.worker';
import { startLifecycleWorker }   from '../workers/lifecycle.worker';
import { startOnboardingNudgeWorker } from '../workers/onboarding-nudge.worker';
import { startZapiHealthWorker }  from '../workers/zapi-health.worker';
import { startMotivationalWorker } from '../workers/motivational-message.worker';
import { startMedicationReviewWorker } from '../workers/medication-review.worker';
import { syncActiveMeds } from '../lib/med-schedule-cache';

const HEALTH_PORT = Number(process.env.PORT) || Number(process.env.WORKERS_HEALTH_PORT) || 3001;

export function startWorkers(): void {
  // Health server mínimo (Railway exige healthcheck para considerar o service vivo)
  const healthServer = http.createServer(async (req, res) => {
    if (req.url === '/health' || req.url === '/healthz') {
      // Verificação leve: Redis disponível? (workers dependem dele)
      try {
        const ping = await redis.ping();
        res.writeHead(ping === 'PONG' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: ping === 'PONG' ? 'ok' : 'degraded', redis: ping }));
      } catch (err: any) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'degraded', error: err.message }));
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  healthServer.listen(HEALTH_PORT, () => {
    logger.info(`🤖 Workers process listening for health on port ${HEALTH_PORT}`, {
      nodeEnv: env.NODE_ENV,
      runMode: 'workers',
    });
  });

  // ── Sincronizar cache de medicamentos do Neon → Redis no boot ────────────
  // Garante que o scheduler inicie com dados frescos sem depender de query
  // inline no primeiro tick. Erros não são fatais — getActiveMeds() faz fallback.
  syncActiveMeds().catch((err) =>
    logger.warn('Boot med-cache sync failed — scheduler will self-heal on first tick', { error: err.message }),
  );

  // Iniciar workers
  startReminderScheduler();
  startReminderSender();
  startFamilyAlerter();
  startLifecycleWorker();
  startOnboardingNudgeWorker();
  startZapiHealthWorker();
  startMotivationalWorker();
  startMedicationReviewWorker();

  logger.info('Workers started: scheduler, sender, alerter, lifecycle, onboarding-nudge, zapi-health, motivational, med-review');
}
