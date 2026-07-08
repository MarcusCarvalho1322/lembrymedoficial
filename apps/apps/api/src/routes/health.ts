/**
 * @module Health & Metrics
 * @description Endpoints de saúde e métricas operacionais do Lembrymed.
 *
 * GET /health  — verificação básica (Redis + DB + filas). Usado por Railway e UptimeRobot.
 * GET /metrics — métricas operacionais detalhadas (para dashboard interno).
 *
 * RAILWAY ALERT: configurar UptimeRobot ou Railway Healthcheck Monitor apontando
 * para https://<seu-domínio>/health. Se retornar status 503 por > 2min, aciona alerta.
 */

import { Router } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { sendReminderQueue, familyAlertQueue } from '../config/queues';
import { logger } from '@lembrymed/shared/logger';
import { WhatsAppClient } from '../clients/dialog360.client';

const router = Router();

/** Verifica conexão Redis via PING */
async function checkRedis(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await redis.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch {
    return { ok: false, latencyMs: -1 };
  }
}

/**
 * Verifica conexão PostgreSQL via query simples.
 *
 * NEON SCALE-TO-ZERO: o Railway chama /health a cada ~30s. Sem cache,
 * isso gera ~120 queries/hora no Neon, impedindo o suspend do compute.
 * Solução: cache do resultado no Redis por 5 minutos. Se a DB cair, o
 * cache expira em 5min e o próximo check detecta o problema.
 */
const DB_HEALTH_CACHE_KEY = 'lembrymed:health:db';
const DB_HEALTH_CACHE_TTL = 300; // 5 minutos em segundos

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number; cached?: boolean }> {
  // Tentar servir do cache Redis primeiro
  try {
    const cached = await redis.get(DB_HEALTH_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { ok: boolean; latencyMs: number };
      return { ...parsed, cached: true };
    }
  } catch {
    // Redis indisponível → prosseguir sem cache
  }

  // Cache miss → consultar o banco de fato
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const result = { ok: true, latencyMs: Date.now() - start };
    // Gravar resultado no Redis (best-effort — não bloqueia a resposta)
    redis.set(DB_HEALTH_CACHE_KEY, JSON.stringify(result), 'EX', DB_HEALTH_CACHE_TTL).catch(() => {});
    return result;
  } catch {
    const result = { ok: false, latencyMs: -1 };
    // Cachear falha por 30s para não martelelar um banco que caiu
    redis.set(DB_HEALTH_CACHE_KEY, JSON.stringify(result), 'EX', 30).catch(() => {});
    return result;
  }
}

/** Retorna profundidade das filas BullMQ */
async function getQueueDepths(): Promise<Record<string, number>> {
  try {
    const [waitingSend, delayedSend, waitingFamily, delayedFamily] = await Promise.all([
      sendReminderQueue.getWaitingCount(),
      sendReminderQueue.getDelayedCount(),
      familyAlertQueue.getWaitingCount(),
      familyAlertQueue.getDelayedCount(),
    ]);
    return {
      'send-reminder:waiting': waitingSend,
      'send-reminder:delayed': delayedSend,
      'family-alert:waiting': waitingFamily,
      'family-alert:delayed': delayedFamily,
    };
  } catch {
    return {};
  }
}

/** Busca métricas de entrega das últimas 24h do Redis */
async function getDeliveryMetrics(): Promise<Record<string, number>> {
  try {
    const keys = [
      'lembrymed:metrics:sent:24h',
      'lembrymed:metrics:failed:24h',
      'lembrymed:metrics:confirmed:24h',
      'lembrymed:metrics:denied:24h',
    ];
    const values = await redis.mget(...keys);
    return {
      sent_24h:      Number(values[0] ?? 0),
      failed_24h:    Number(values[1] ?? 0),
      confirmed_24h: Number(values[2] ?? 0),
      denied_24h:    Number(values[3] ?? 0),
    };
  } catch {
    return {};
  }
}

// ─── GET /health ───────────────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  const [redisCheck, dbCheck] = await Promise.all([checkRedis(), checkDatabase()]);

  const allOk = redisCheck.ok && dbCheck.ok;

  const payload = {
    status: allOk ? 'ok' : 'degraded',
    version: 'v2.11-obs',
    timestamp: new Date().toISOString(),
    checks: {
      redis: {
        status: redisCheck.ok ? 'connected' : 'error',
        latencyMs: redisCheck.latencyMs,
      },
      database: {
        status: dbCheck.ok ? 'connected' : 'error',
        latencyMs: dbCheck.latencyMs,
      },
    },
  };

  if (!allOk) {
    logger.error('Health check degraded', payload.checks);
  }

  res.status(allOk ? 200 : 503).json(payload);
});

// ─── GET /metrics ──────────────────────────────────────────────────────────────
// Protegido por segredo simples (METRICS_SECRET env var).
// Não precisa de JWT completo — é consumido por monitoring interno.

router.get('/metrics', async (req, res) => {
  const secret = env.METRICS_SECRET;
  if (secret && req.headers['x-metrics-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [redisCheck, dbCheck, queueDepths, deliveryMetrics] = await Promise.all([
      checkRedis(),
      checkDatabase(),
      getQueueDepths(),
      getDeliveryMetrics(),
    ]);

    return res.json({
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      checks: {
        redis: redisCheck,
        database: dbCheck,
      },
      queues: queueDepths,
      delivery: deliveryMetrics,
      circuit_breaker: WhatsAppClient.getCircuitState(),
    });
  } catch (err: any) {
    logger.error('Metrics endpoint error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
