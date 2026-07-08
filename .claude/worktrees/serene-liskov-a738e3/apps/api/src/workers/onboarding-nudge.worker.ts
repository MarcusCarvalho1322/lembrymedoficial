/**
 * @module Worker — Onboarding Nudge
 * @description Verifica pacientes "presos" no onboarding (sem resposta há mais de 2h)
 * e envia uma mensagem gentil de reengajamento.
 *
 * Roda a cada 60 minutos via node-cron.
 *
 * Casos cobertos:
 *  - Paciente recebeu boas-vindas mas nunca respondeu (welcome_sent, > 2h)
 *  - Paciente iniciou mas parou no meio (medications_requested / medications_received, > 2h)
 *  - Paciente confirmou meds mas não respondeu sobre familiar (family_asked, > 2h)
 *
 * Limites de nudge: máximo 2 nudges por etapa (evita spam).
 * Após o 2º nudge, o caso é marcado para revisão manual (via log de alerta).
 */

import cron from 'node-cron';
import { db, patients, familyContacts, eq, and } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';

const NUDGE_INTERVAL_HOURS = 2;
const MAX_NUDGES_PER_STEP  = 2;

// Etapas intermediárias do onboarding (excluindo 'active' e os passos finais)
const STUCK_STEPS = [
  'welcome_sent',
  'medications_requested',
  'medications_received',
  'medications_confirmed',
  'family_asked',
];

function buildNudgeMessage(
  firstName: string,
  step: string,
  nudgeCount: number,
): string {
  const isSecondNudge = nudgeCount >= 1;

  if (step === 'welcome_sent') {
    return isSecondNudge
      ? `${firstName}, tudo bem? 🤗 Vi que ainda não configuramos seus lembretes.\n\n` +
        `Quando quiser, é só me responder dizendo quais medicamentos você toma. ` +
        `Estou aqui para ajudar! 💊`
      : `${firstName}, olá! 👋 Ainda não configuramos seus lembretes de medicamentos.\n\n` +
        `Me diga: *quais medicamentos você toma e em quais horários?* ` +
        `Pode ser uma lista simples mesmo! 📋`;
  }

  if (step === 'medications_requested' || step === 'medications_received') {
    return isSecondNudge
      ? `${firstName}, conseguiu a lista dos seus medicamentos? 💊\n\n` +
        `Assim que me enviar os nomes e horários, seus lembretes ficam prontos! ✅`
      : `${firstName}, lembrei de você! 🙂\n\n` +
        `Para configurar seus lembretes, preciso saber quais medicamentos você toma e os horários. ` +
        `Me envie a lista quando puder! 📋`;
  }

  if (step === 'medications_confirmed' || step === 'family_asked') {
    return isSecondNudge
      ? `${firstName}, seus medicamentos já estão configurados! ✅\n\n` +
        `Só falta uma última pergunta: deseja cadastrar um *contato familiar* que receba avisos?\n\n` +
        `Pode responder *SIM* (com o nome e WhatsApp do familiar) ou *NÃO* para finalizar. 👨‍👩‍👧`
      : `${firstName}, quase lá! 🎯 Seus medicamentos estão salvos.\n\n` +
        `Quer cadastrar um familiar para receber alertas caso você esqueça de confirmar um medicamento? ` +
        `É opcional — responda *SIM* ou *NÃO*! 👨‍👩‍👧`;
  }

  // Fallback genérico
  return `${firstName}, ainda estamos configurando seus lembretes! 💊\n\n` +
    `Me responda aqui quando puder que continuo te ajudando. 🙂`;
}

export function startOnboardingNudgeWorker() {
  const whatsapp = new WhatsAppClient();

  // Roda a cada 60 minutos (verificação granular)
  cron.schedule('0 * * * *', async () => {
    logger.info('Onboarding nudge check started');

    try {
      // Buscar pacientes com onboarding parado há mais de NUDGE_INTERVAL_HOURS
      // e que ainda não ultrapassaram o limite de nudges
      const stuckPatients = await db.execute(sql`
        SELECT
          p.id,
          p.full_name,
          p.phone,
          p.onboarding_step,
          p.onboarding_nudge_count,
          p.updated_at
        FROM patients p
        WHERE p.onboarding_step = ANY(${STUCK_STEPS}::text[])
          AND p.is_active = true
          AND p.updated_at < NOW() - INTERVAL '${sql.raw(String(NUDGE_INTERVAL_HOURS))} hours'
          AND (p.onboarding_nudge_count IS NULL OR p.onboarding_nudge_count < ${MAX_NUDGES_PER_STEP})
      `);

      logger.info('Pacientes com onboarding parado', { count: stuckPatients.rows.length });

      for (const row of stuckPatients.rows as any[]) {
        const firstName  = (row.full_name as string).split(' ')[0];
        const nudgeCount = Number(row.onboarding_nudge_count ?? 0);

        const msg = buildNudgeMessage(firstName, row.onboarding_step, nudgeCount);

        try {
          await whatsapp.sendTextMessage(row.phone, msg);

          // Incrementar contador de nudges + atualizar updated_at para reiniciar janela
          await db.execute(sql`
            UPDATE patients
            SET
              onboarding_nudge_count = COALESCE(onboarding_nudge_count, 0) + 1,
              updated_at = NOW()
            WHERE id = ${row.id}::uuid
          `);

          logger.info('Nudge de onboarding enviado', {
            patientId:   row.id,
            step:        row.onboarding_step,
            nudgeNumber: nudgeCount + 1,
          });

        } catch (msgErr: any) {
          logger.error('Falha ao enviar nudge', {
            error:     msgErr.message,
            patientId: row.id,
          });
        }
      }

      // ── Pacientes que esgotaram nudges: avisar o familiar cadastrado, se houver ──
      // Lógica: se o paciente não responde após 2 tentativas E tem familiar registrado,
      // enviamos uma mensagem gentil para o familiar pedir para ele completar o cadastro.
      // Sem alertas para suporte ou terceiros — só o familiar do próprio paciente.
      const abandonedPatients = await db.execute(sql`
        SELECT p.id, p.full_name, p.phone, p.onboarding_step, p.onboarding_nudge_count
        FROM patients p
        WHERE p.onboarding_step = ANY(${STUCK_STEPS}::text[])
          AND p.is_active = true
          AND p.onboarding_nudge_count >= ${MAX_NUDGES_PER_STEP}
          AND p.updated_at < NOW() - INTERVAL '24 hours'
      `);

      if (abandonedPatients.rows.length > 0) {
        const rows = abandonedPatients.rows as any[];

        logger.warn('Pacientes com onboarding abandonado', {
          count: rows.length,
          patients: rows.map((r) => ({
            id: r.id, name: r.full_name, step: r.onboarding_step,
          })),
        });

        // Para cada paciente abandonado, verificar se tem familiar ativo e avisar
        for (const row of rows) {
          const familiar = await db.query.familyContacts.findFirst({
            where: and(
              eq(familyContacts.patientId, row.id),
              eq(familyContacts.isActive, true),
            ),
          });

          if (!familiar) continue; // sem familiar → só loga, nenhuma ação

          const firstName = (row.full_name as string).split(' ')[0];

          const familyMsg =
            `Olá, ${familiar.name}! 👋\n\n` +
            `Sou o assistente do *Lembrymed*, o serviço de lembretes de medicamentos ` +
            `que *${firstName}* assinou.\n\n` +
            `Tentamos ajudar ${firstName} a configurar os lembretes, mas não conseguimos ` +
            `finalizar o cadastro. Pode dar um empurrãozinho? 🙂\n\n` +
            `É só pedir para ${firstName} me responder no WhatsApp que concluímos em poucos minutos! 💊`;

          await whatsapp.sendTextMessage(familiar.phone, familyMsg).catch((err: any) =>
            logger.error('Falha ao alertar familiar sobre onboarding abandonado', {
              error: err.message, patientId: row.id, familiarPhone: familiar.phone,
            })
          );

          logger.info('Familiar alertado sobre onboarding abandonado', {
            patientId: row.id, patientName: row.full_name, familiarName: familiar.name,
          });
        }
      }

      logger.info('Onboarding nudge check completed', {
        nudgesSent: stuckPatients.rows.length,
        abandoned:  abandonedPatients.rows.length,
      });

    } catch (error: any) {
      logger.error('Onboarding nudge worker failed', { error: error.message });
    }
  });

  logger.info('Onboarding nudge worker started (checks every 60min, nudges after 2h idle)');
}
