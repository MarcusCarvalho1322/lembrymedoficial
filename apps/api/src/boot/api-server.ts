/**
 * @module Bootstrap — API HTTP server (rotas Express)
 *
 * Inicia somente o Express com webhooks + admin. Workers vivem em
 * `boot/workers-runner.ts` (processo separado em produção).
 */

import express from 'express';
import cors from 'cors';
import { env } from '../config/env';
import { logger } from '@lembrymed/shared/logger';

// Webhooks
import stripeWebhook from '../routes/webhooks/stripe';
import whatsappWebhook from '../routes/webhooks/whatsapp';
import healthRoute from '../routes/health';

// Admin
import authRoute, { requireAdmin } from '../middleware/auth';
import dashboardRoute from '../routes/admin/dashboard';
import patientsRoute from '../routes/admin/patients';
import renewalsRoute from '../routes/admin/renewals';
import queueRoute from '../routes/admin/queue';
import { errorHandler } from '../middleware/errorHandler';
import { securityHeaders } from '../middleware/securityHeaders';

export function startApiServer(): void {
  const app = express();
  const PORT = env.PORT;

  // ═══ CONFIAR NO PROXY DO RAILWAY ═══
  app.set('trust proxy', 1);

  // ═══ MIDDLEWARE DE SEGURANÇA (global) ═══
  app.use(securityHeaders);

  // Stripe webhook precisa do raw body ANTES do express.json()
  app.use('/webhook/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '1mb' }));

  // ═══ ROTAS DE WEBHOOK (antes do CORS) ═══
  app.use(stripeWebhook);
  app.use(whatsappWebhook);
  app.use(healthRoute);

  // ═══ CORS restritivo ═══
  const allowedOrigins = new Set<string>([env.WEB_URL]);
  if (env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://localhost:3001');
  }
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin)) return cb(null, true);
        logger.warn('CORS bloqueado', { origin });
        return cb(new Error('Origem não permitida'), false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Admin-CSRF'],
      maxAge: 86400,
    }),
  );

  // ═══ ROTAS ADMIN ═══
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
    logger.info(`🚀 Lembrymed API running on port ${PORT}`, {
      nodeEnv: env.NODE_ENV,
      whatsappProvider: env.WHATSAPP_PROVIDER,
      runMode: 'api',
    });
  });
}
