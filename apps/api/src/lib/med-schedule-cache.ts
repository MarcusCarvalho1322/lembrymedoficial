/**
 * @module Cache de agendamento de medicamentos (Redis)
 *
 * Centraliza a lista de medicamentos ativos em Redis como fonte primária.
 * O Neon é consultado APENAS em dois momentos:
 *   (a) No boot do processo de workers (syncActiveMeds chamado em workers-runner.ts)
 *   (b) Após mutações que alteram quais pacientes/meds estão ativos
 *       (novo paciente ativado, meds inseridos, renovação, deleção LGPD)
 *
 * Durante operação normal (steady-state), o scheduler lê 100% do Redis:
 *   - Zero queries ao Neon por tick de scheduling
 *   - Scale to Zero do Neon pode ativar durante períodos sem mutações
 *     (ex: madrugada de 2h-6h quando não há cadastros nem renovações)
 *
 * Dedup de envio: gerencia chaves Redis de deduplicação de lembretes,
 * substituindo o SELECT em reminder_logs que o scheduler fazia a cada tick.
 *   - reminder-sender.worker.ts → seta a chave após envio bem-sucedido
 *   - reminder-scheduler.worker.ts → checa antes de enfileirar
 *
 * Tolerância a falhas Redis:
 *   - getActiveMeds: cai de volta ao Neon se Redis indisponível
 *   - isReminderAlreadySent: assume "não enviado" se Redis cair (melhor
 *     enviar duplicado do que silenciar um lembrete de medicamento)
 *   - markReminderSent: silencioso em falha (jobId BullMQ previne re-enqueue imediato)
 */

import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../config/redis';
import { logger } from '@lembrymed/shared/logger';

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ActiveMedRow = {
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  medication_id: string;
  med_name: string;
  dosage: string;
  med_time: string;
};

// ── Constantes ───────────────────────────────────────────────────────────────

/** Chave Redis com o JSON array de medicamentos ativos */
const MEDS_KEY = 'lembrymed:schedule:meds';

/** Timestamp da última sincronização (para diagnóstico) */
const SYNCED_AT_KEY = 'lembrymed:schedule:meds:synced_at';

/** Prefixo das chaves de dedup de envio de lembrete */
const DEDUP_PREFIX = 'lembrymed:dedup:sched';

/** TTL do dedup: 26h cobre 1 dia completo com margem para meia-noite BRT */
const DEDUP_TTL_SECONDS = 26 * 60 * 60;

// ── Cache de medicamentos ativos ─────────────────────────────────────────────

/**
 * Consulta o Neon para lista de medicamentos ativos e persiste no Redis sem TTL.
 * A chave não expira — é atualizada por eventos de mutação (ou no boot).
 *
 * Chamado por:
 *  - workers-runner.ts no boot
 *  - invalidateAndSync() após mutações
 */
export async function syncActiveMeds(): Promise<ActiveMedRow[]> {
  const result = await db.execute(sql`
    SELECT
      p.id          AS patient_id,
      p.full_name   AS patient_name,
      p.phone       AS patient_phone,
      m.id          AS medication_id,
      m.name        AS med_name,
      m.dosage,
      unnest(m.times) AS med_time
    FROM patients p
    JOIN medications   m ON m.patient_id = p.id AND m.is_active = true
    JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
    WHERE p.is_active = true
      AND p.onboarding_step = 'active'
  `);

  const rows = result.rows as ActiveMedRow[];

  // Pipeline: salvar dados + timestamp em uma única round-trip
  await redis.pipeline()
    .set(MEDS_KEY, JSON.stringify(rows))
    .set(SYNCED_AT_KEY, new Date().toISOString())
    .exec();

  logger.info('Med schedule cache synced from Neon', { count: rows.length });
  return rows;
}

/**
 * Retorna medicamentos ativos do Redis.
 * Se a chave não existir (boot frio, Redis reiniciado ou após DEL),
 * sincroniza do Neon automaticamente como fallback.
 */
export async function getActiveMeds(): Promise<ActiveMedRow[]> {
  try {
    const cached = await redis.get(MEDS_KEY);
    if (cached) return JSON.parse(cached) as ActiveMedRow[];
  } catch (err: any) {
    // Redis indisponível — fallback para Neon para não parar lembretes
    logger.warn('Redis unavailable in getActiveMeds, falling back to Neon', { error: err.message });
  }

  // Cache miss ou Redis down → sincronizar do Neon
  return syncActiveMeds();
}

/**
 * Invalida o cache e re-sincroniza imediatamente do Neon.
 *
 * Deve ser chamado após qualquer operação que altere quais pacientes
 * ou medicamentos devem receber lembretes:
 *   - Inserção de medicamentos (onboarding / med_update)
 *   - Ativação de paciente (onboarding concluído, stripe renovação)
 *   - PATCH admin que altera is_active ou onboarding_step
 *   - DELETE LGPD de paciente
 */
export async function invalidateAndSync(): Promise<void> {
  try {
    await redis.del(MEDS_KEY);
    await syncActiveMeds();
  } catch (err: any) {
    // Não crítico: o scheduler usará dados do ciclo anterior se houver cache,
    // ou buscará do Neon no próximo tick via getActiveMeds fallback.
    logger.warn('Cache invalidation failed (non-critical, will self-heal)', { error: err.message });
  }
}

// ── Dedup de envio de lembretes ──────────────────────────────────────────────
//
// Substitui o SELECT em reminder_logs que o scheduler fazia a cada tick.
// A chave é setada pelo reminder-sender após envio bem-sucedido ao WhatsApp.
// O scheduler checa antes de enfileirar um job de envio.
//
// Por que não depender só do jobId BullMQ para dedup?
//   removeOnComplete: { count: 100 } libera o jobId após conclusão.
//   Se o scheduler rodar 2 minutos depois do job concluído (e removido),
//   ele re-enfileiraria o mesmo lembrete. A chave Redis impede isso.

/**
 * Gera a chave Redis de deduplicação para um lembrete específico no dia.
 */
export function reminderDedupKey(
  patientId: string,
  medicationId: string,
  reminderType: string,
  todayBRT: string,
): string {
  return `${DEDUP_PREFIX}:${patientId}:${medicationId}:${reminderType}:${todayBRT}`;
}

/**
 * Retorna true se o lembrete já foi enviado hoje.
 * Em caso de falha do Redis, retorna false (prefere envio duplicado a silêncio).
 */
export async function isReminderAlreadySent(key: string): Promise<boolean> {
  try {
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

/**
 * Marca o lembrete como enviado. Chamado pelo reminder-sender após sucesso.
 * TTL de 26h cobre o dia com margem para cruzamento de meia-noite BRT.
 */
export async function markReminderSent(key: string): Promise<void> {
  try {
    await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS);
  } catch {
    // Silencioso — jobId determinístico do BullMQ previne re-enqueue imediato
  }
}
