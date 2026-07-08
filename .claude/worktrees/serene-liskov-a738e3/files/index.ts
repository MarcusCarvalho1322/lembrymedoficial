/**
 * @module Servidor Principal Lembrymed v2
 * @description Express server com webhooks + admin API + workers BullMQ.
 * Arquitetura híbrida: Managed Agent (onboarding) + BullMQ (lembretes).
 */

import express from 'express';
import cors from 'cors';
import { logger } from '@lembrymed/shared/logger';

// Webhooks
import stripeWebhook from './routes/webhooks/stripe';
import whatsappWebhook from './routes/webhooks/whatsapp';
import healthRoute from './routes/health';

// Admin
import authRoute, { requireAdmin } from './middleware/auth';
import dashboardRoute from './routes/admin/dashboard';
import patientsRoute from './routes/admin/patients';
import renewalsRoute from './routes/admin/renewals';
import queueRoute from './routes/admin/queue';
import { errorHandler } from './middleware/errorHandler';

// Workers
import { startReminderScheduler } from './workers/reminder-scheduler.worker';
import { startReminderSender } from './workers/reminder-sender.worker';
import { startFamilyAlerter } from './workers/family-alerter.worker';
import { startLifecycleWorker } from './workers/lifecycle.worker';

const app = express();
const PORT = process.env.PORT || 3000;

// ═══ MIDDLEWARE GLOBAL ═══
app.use(cors({ origin: process.env.WEB_URL || '*' }));

// Stripe webhook precisa do raw body ANTES do express.json()
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json());

// ═══ ROTAS PÚBLICAS ═══
app.use(stripeWebhook);
app.use(whatsappWebhook);
app.use(healthRoute);

// ═══ ROTAS ADMIN (protegidas por JWT) ═══
app.use(authRoute);
app.use('/admin/*', requireAdmin);
app.use(dashboardRoute);
app.use(patientsRoute);
app.use(renewalsRoute);
app.use(queueRoute);

// ═══ ERROR HANDLER ═══
app.use(errorHandler);

// ═══ START ═══
app.listen(PORT, () => {
  logger.info(`🚀 Lembrymed API v2 running on port ${PORT}`);
  logger.info('Architecture: Managed Agent (onboarding) + BullMQ (reminders)');

  // Iniciar workers BullMQ
  startReminderScheduler();
  startReminderSender();
  startFamilyAlerter();
  startLifecycleWorker();

  logger.info('All workers started — scheduler, sender, alerter, lifecycle');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled rejection', { error: reason?.message || reason });
});
