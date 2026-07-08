/**
 * @module Session Stream Service (LEGADO — desativado)
 * @description Anteriormente processava streams de Managed Agents.
 * O onboarding agora usa Claude messages.create via webhook WhatsApp.
 * Este arquivo é mantido para compatibilidade de imports.
 */

import { logger } from '@lembrymed/shared/logger';

/**
 * @deprecated Managed Agents substituídos por messages.create em whatsapp.ts
 */
export async function processSessionStream(sessionId: string): Promise<void> {
  logger.warn('processSessionStream chamado mas Managed Agents foram desativados', { sessionId });
}
