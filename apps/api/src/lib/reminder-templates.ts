/**
 * @module Reminder Templates
 * @description Templates de mensagem para cada tipo de lembrete.
 * Exportado separadamente para ser testável de forma pura.
 *
 * Inclui retrocompatibilidade com tipos legados (MVP v1) que podem
 * ainda estar em jobs BullMQ em voo no Redis durante deploys.
 */

export type TemplateFn = (name: string, dosage: string, time?: string) => string;

export const REMINDER_TEMPLATES: Record<string, TemplateFn> = {
  // ── Formato ativo (régua de 2 mensagens) ───────────────────────────────
  t_zero: (name, dosage, time) =>
    `💊 ${time ? `São ${time} — h` : 'H'}ora de tomar sua ${name} ${dosage}!`,

  t_plus_10: (name, dosage) =>
    `Você tomou sua ${name} ${dosage}?\nResponda SIM ou NÃO 💊`,

  // ── Retrocompatibilidade (jobs legados em voo no Redis durante deploys) ──
  t_minus_10: (name, dosage, time) =>
    `⏰ Daqui 10 minutos é hora de tomar sua ${name} ${dosage}${time ? ` (${time})` : ''}. Prepare-se! 💊`,

  t_minus_30: (name, dosage) =>
    `⏰ Daqui 30 minutos é hora de tomar sua ${name} ${dosage}. Prepare-se! 💊`,

  t_minus_5: (name, dosage) =>
    `⏰ Daqui 5 minutos é hora de tomar sua ${name} ${dosage}. Prepare-se! 💊`,

  t_plus_5: (name, dosage) =>
    `Você tomou sua ${name} ${dosage}?\nResponda SIM ou NÃO 💊`,
};

/**
 * Retorna a mensagem formatada para um tipo de lembrete.
 * Se o tipo for desconhecido, retorna mensagem genérica de fallback.
 */
export function buildReminderMessage(
  reminderType: string,
  medicationName: string,
  dosage: string,
  medicationTime?: string,
): string {
  const fn = REMINDER_TEMPLATES[reminderType];
  if (!fn) {
    return `💊 Lembrete: ${medicationName} ${dosage} — verifique seus medicamentos.`;
  }
  return fn(medicationName, dosage, medicationTime);
}

/**
 * Verifica se um tipo de lembrete deve disparar verificação familiar.
 * T+10 (ativo) e T+5 (legado) acionam o family-alerter após 30 min.
 */
export function shouldTriggerFamilyAlert(reminderType: string): boolean {
  return reminderType === 't_plus_10' || reminderType === 't_plus_5';
}
