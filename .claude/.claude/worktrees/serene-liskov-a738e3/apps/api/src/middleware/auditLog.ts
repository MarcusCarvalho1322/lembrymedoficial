/**
 * @module Middleware — Audit Log
 * @description Registra ações admin sensíveis na tabela `admin_audit_logs`.
 * LGPD Art. 46 exige rastreabilidade de acessos a dado sensível de saúde.
 *
 * Uso:
 *   router.get('/admin/patients/:id', auditAdminAccess('view_patient'), handler);
 *
 * Não bloqueia a request — loga em background. Se Redis/Neon cair, só warning.
 */

import { Response, NextFunction } from 'express';
import { db, adminAuditLogs } from '@lembrymed/database';
import { logger } from '@lembrymed/shared/logger';
import type { AdminRequest } from './auth';

type AuditAction =
  | 'view_patient'
  | 'view_patient_list'
  | 'edit_patient'
  | 'delete_patient'
  | 'export_patient'
  | 'send_renewal_reminder'
  | 'login'
  | 'clean_queue';

interface AuditOptions {
  /** Extrai o patientId do request (params/body). Default: `req.params.id`. */
  patientId?: (req: AdminRequest) => string | undefined | null;
  /** Dados extras estruturados a salvar em `metadata`. */
  metadata?: (req: AdminRequest) => Record<string, unknown> | undefined;
}

export function auditAdminAccess(action: AuditAction, opts: AuditOptions = {}) {
  return async function auditMiddleware(
    req: AdminRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Inicia a request imediatamente — audit é fire-and-forget
    next();

    // Depois, em background, registramos
    const adminEmail = req.admin?.email ?? 'unknown';
    const patientIdGetter = opts.patientId ?? ((r) => r.params.id);
    const patientId = patientIdGetter(req);

    try {
      await db.insert(adminAuditLogs).values({
        adminEmail,
        action,
        patientId: patientId || null,
        ipAddress: ((req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '').trim() || null,
        userAgent: (req.headers['user-agent'] as string) || null,
        metadata: opts.metadata?.(req) ?? null,
      });
    } catch (err: any) {
      logger.warn('Falha ao registrar audit log admin (ignorado)', {
        error: err.message,
        action,
        adminEmail,
        patientId,
      });
    }
  };
}
