/**
 * @module Servidor Principal Lembrymed v2
 * @description Express server com webhooks + admin API + workers BullMQ.
 * Arquitetura híbrida: Claude messages.create (onboarding) + BullMQ (lembretes).
 *
 * ⚠️ A PRIMEIRA LINHA abaixo importa `./config/env` para forçar validação das
 * variáveis de ambiente no boot. Se qualquer env obrigatória estiver ausente,
 * o processo encerra com código 1 antes de aceitar requests.
 */

import { env } from './config/env'; // ← fail-fast em env inválida (mantém como 1º import)
import { bootstrapSentry, getCaptureException } from './config/sentry';

import express from 'express';
import cors from 'cors';
import { logger } from '@lembrymed/shared/logger';

// Inicializa Sentry antes de qualquer outra coisa. Opcional — só ativa
// se SENTRY_DSN estiver definido.
void bootstrapSentry();

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
import { securityHeaders } from './middleware/securityHeaders';

// Workers
import { startReminderScheduler } from './workers/reminder-scheduler.worker';
import { startReminderSender } from './workers/reminder-sender.worker';
import { startFamilyAlerter } from './workers/family-alerter.worker';
import { startLifecycleWorker } from './workers/lifecycle.worker';
import { startOnboardingNudgeWorker } from './workers/onboarding-nudge.worker';
import { startZapiHealthWorker } from './workers/zapi-health.worker';

const app = express();
const PORT = env.PORT;

// ═══ CONFIAR NO PROXY DO RAILWAY ═══
// Railway coloca o app atrás de proxy; precisamos confiar em X-Forwarded-*
// para extrair IP real (usado em rate limit e logs).
app.set('trust proxy', 1);

// ═══ MIDDLEWARE DE SEGURANÇA (global, antes das rotas) ═══
app.use(securityHeaders);

// Stripe webhook precisa do raw body ANTES do express.json()
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' }));

// ═══ ROTAS DE WEBHOOK (antes do CORS) ═══
// Webhooks são chamadas server-to-server (Z-API, Stripe) — CORS não se aplica.
// Z-API envia Origin: https://api.z-api.io mesmo sendo server-to-server;
// colocar essas rotas antes do CORS evita que sejam bloqueadas indevidamente.
app.use(stripeWebhook);
app.use(whatsappWebhook);
app.use(healthRoute);

// ═══ CORS restritivo (apenas para rotas admin / browser-facing) ═══
// Aceita apenas WEB_URL configurada. Em dev, aceita localhost:3000.
const allowedOrigins = new Set<string>([env.WEB_URL]);
if (env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://localhost:3001');
}

app.use(
  cors({
    origin: (origin, cb) => {
      // Requests sem Origin (ex: curl, server-to-server) — permitir
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      logger.warn('CORS bloqueado', { origin });
      return cb(new Error('Origem não permitida'), false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// ═══ ROTAS ADMIN (protegidas por JWT) ═══
app.use(authRoute); // registra POST /admin/login (com rate limit interno)
app.use('/admin/*', requireAdmin);
app.use(dashboardRoute);
app.use(patientsRoute);
app.use(renewalsRoute);
app.use(queueRoute);

// ═══ ERROR HANDLER ═══
app.use(errorHandler);

// ═══ START ═══
app.listen(PORT, () => {
  logger.info(`🚀 Lembrymed API v2.10-AUDIT-DEPLOY-MARKER-2026042218 running on port ${PORT}`, {
    nodeEnv: env.NODE_ENV,
    whatsappProvider: env.WHATSAPP_PROVIDER,
  });

  // Iniciar workers BullMQ + crons
  startReminderScheduler();
  startReminderSender();
  startFamilyAlerter();
  startLifecycleWorker();
  startOnboardingNudgeWorker();
  startZapiHealthWorker();

  logger.info('Workers started: scheduler, sender, alerter, lifecycle, onboarding-nudge, zapi-health');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  getCaptureException()(err, { type: 'uncaughtException' });
  if (process.env.NODE_ENV !== 'test') process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const err = reason as Error;
  logger.error('Unhandled rejection', { error: err?.message || String(reason) });
  getCaptureException()(err, { type: 'unhandledRejection' });
});
