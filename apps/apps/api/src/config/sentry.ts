/**
 * @module Sentry bootstrap (opcional)
 * @description Inicializa Sentry apenas se `SENTRY_DSN` estiver definido.
 *
 * Por que assim: evitamos impor uma dependência pesada (~2MB) na imagem
 * Docker quando Marcus ainda não decidiu se/quando quer observabilidade.
 * O módulo @sentry/node é importado via dynamic import; se não estiver
 * instalado, apenas logamos um aviso e seguimos sem Sentry.
 *
 * Para habilitar Sentry:
 *   1. `npm install @sentry/node` em apps/api
 *   2. Configurar SENTRY_DSN nas env vars Railway
 *
 * Retorna uma função `captureException` para uso idiomático no resto
 * do código, que vira no-op se Sentry não estiver disponível.
 */

import { logger } from '@lembrymed/shared/logger';
import { env } from './env';

type CaptureFn = (err: unknown, ctx?: Record<string, unknown>) => void;

let captureException: CaptureFn = () => {
  // no-op quando Sentry não está configurado
};

export async function bootstrapSentry(): Promise<CaptureFn> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    logger.debug('Sentry desativado (SENTRY_DSN ausente)');
    return captureException;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = await import('@sentry/node' as any);
    Sentry.init({
      dsn,
      environment: env.NODE_ENV,
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      serverName: 'lembrymed-api',
    });
    captureException = (err, ctx) => {
      Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
    };
    logger.info('Sentry inicializado');
  } catch (err: any) {
    logger.warn(
      'SENTRY_DSN está definido, mas @sentry/node não está instalado. ' +
        'Execute `npm install @sentry/node` em apps/api.',
      { error: err.message },
    );
  }

  return captureException;
}

export function getCaptureException(): CaptureFn {
  return captureException;
}
