import { Request, Response, NextFunction } from 'express';
import { logger } from '@lembrymed/shared/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Erro interno do servidor' });
}
