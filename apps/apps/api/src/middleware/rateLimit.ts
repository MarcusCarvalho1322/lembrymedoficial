/**
 * @module Rate Limit (Redis)
 * @description Rate limit simples usando Redis INCR+EXPIRE.
 * Projetado para proteger endpoints sensíveis (login, webhooks, forms).
 *
 * Uso:
 *   app.use('/admin/login', rateLimit({ key: 'login', max: 5, windowSec: 900 }));
 *
 * Chave é composta por IP + identificador opcional (ex: email) para defesa em
 * dupla camada — impede bruteforce por IP e enumeração por email.
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { logger } from '@lembrymed/shared/logger';

interface RateLimitOptions {
  /** Nome curto do limite (ex: "login", "checkout"). Usado no prefixo da chave Redis. */
  key: string;
  /** Máximo de requests na janela. */
  max: number;
  /** Janela em segundos. */
  windowSec: number;
  /**
   * Função opcional que extrai um identificador adicional do request
   * (ex: email do body no login). Somado ao IP para chave composta.
   */
  identifier?: (req: Request) => string | undefined;
  /** Mensagem de erro em PT-BR. */
  message?: string;
  /**
   * Se true, não incrementa o contador — só verifica. Útil para rotas que
   * precisam zerar contador em caso de sucesso (ex: login OK).
   */
  readOnly?: boolean;
}

function clientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string) || '';
  return (fwd.split(',')[0] || req.ip || 'unknown').trim();
}

export function rateLimit(opts: RateLimitOptions) {
  const { key, max, windowSec, identifier, message, readOnly } = opts;

  return async function limiter(req: Request, res: Response, next: NextFunction) {
    const ip = clientIp(req);
    const extra = identifier?.(req);
    const parts = [ip, extra].filter(Boolean).join(':');
    const redisKey = `lembrymed:rl:${key}:${parts}`;

    try {
      const current = readOnly
        ? Number(await redis.get(redisKey))
        : await redis.incr(redisKey);

      if (!readOnly && current === 1) {
        await redis.expire(redisKey, windowSec);
      }

      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader(
        'X-RateLimit-Remaining',
        String(Math.max(0, max - current)),
      );

      if (current > max) {
        const ttl = await redis.ttl(redisKey);
        logger.warn('Rate limit exceeded', {
          key,
          ip,
          hasIdentifier: !!extra,
          current,
          max,
        });
        res.setHeader('Retry-After', String(Math.max(ttl, 1)));
        return res.status(429).json({
          error:
            message ||
            'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
          retryAfterSec: Math.max(ttl, 1),
        });
      }

      next();
    } catch (err: any) {
      // Se Redis falhar, preferimos deixar passar (fail-open) para não travar
      // produção por problema de infra — mas logamos warning para monitoração.
      logger.warn('Rate limiter error (fail-open)', {
        key,
        error: err.message,
      });
      next();
    }
  };
}

/**
 * Reset manual de contador — use após login bem-sucedido para não punir o admin
 * por ter errado a senha antes.
 */
export async function resetRateLimit(
  key: string,
  ip: string,
  identifier?: string,
): Promise<void> {
  const parts = [ip, identifier].filter(Boolean).join(':');
  const redisKey = `lembrymed:rl:${key}:${parts}`;
  await redis.del(redisKey).catch(() => {});
}
