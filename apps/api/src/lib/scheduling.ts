/**
 * @module Scheduling Logic — Reminder Window Detection
 * @description Determina qual tipo de lembrete deve ser enviado dado
 * o tempo restante até/desde o horário do medicamento.
 *
 * Extraído do reminder-scheduler.worker.ts para ser testável de forma pura,
 * sem dependência de BullMQ, Redis ou banco de dados.
 */

export type ReminderType = 't_minus_10' | 't_zero' | 't_plus_10' | null;

/**
 * Determina o tipo de lembrete a partir da diferença de minutos.
 *
 * @param diffMin - Diferença em minutos: positivo = medicamento ainda não chegou,
 *                  negativo = já passou o horário.
 *
 * Janelas (régua de 2 mensagens — decisão de produto):
 *   T±0  : diffMin ∈ [-3, 3]   → na hora exata
 *   T+10 : diffMin ∈ [-14, -7] → confirmação 10 min depois
 *   null : fora de qualquer janela → ignorar
 *   (t_minus_10 foi descontinuado; o tipo permanece no union apenas para
 *    retrocompatibilidade com jobs BullMQ em voo durante deploys)
 */
export function getReminderType(diffMin: number): ReminderType {
  if (diffMin >= -3 && diffMin <= 3)   return 't_zero';
  if (diffMin >= -14 && diffMin <= -7) return 't_plus_10';
  return null;
}

/**
 * Calcula a diferença em minutos entre o horário do medicamento e agora.
 *
 * @param medHours   - Hora do medicamento (0-23)
 * @param medMinutes - Minuto do medicamento (0-59)
 * @param nowBRT     - Data/hora atual em BRT
 * @returns Diferença em minutos (positivo = futuro, negativo = passado)
 */
export function calcDiffMinutes(
  medHours: number,
  medMinutes: number,
  nowBRT: Date,
): number {
  const medTime = new Date(nowBRT);
  medTime.setHours(medHours, medMinutes, 0, 0);
  return (medTime.getTime() - nowBRT.getTime()) / 60_000;
}

/**
 * Verifica se um horário no formato "HH:MM" é válido.
 */
export function isValidMedTime(time: string): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
