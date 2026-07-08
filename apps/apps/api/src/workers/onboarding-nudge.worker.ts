/**
 * @module Worker — Onboarding Nudge
 * @description Verifica pacientes "presos" no onboarding e envia reengajamento.
 *
 * Roda a cada 5 minutos via node-cron.
 *
 * Dois fluxos distintos:
 *
 * ETAPAS PÓS-MEDICAMENTOS (family_asked / family_registered / medications_confirmed):
 *   Cliente já pagou e tem medicamentos cadastrados. Familiar é OPCIONAL.
 *   → 5 min sem resposta: envia 1 aviso e ativa imediatamente.
 *   → Lembretes começam no próximo minuto do scheduler.
 *
 * ETAPAS PRÉ-MEDICAMENTOS (welcome_sent / medications_requested / medications_received):
 *   → 2h sem resposta: até 2 nudges de reengajamento.
 *   → Após esgotar nudges: alerta familiar (se houver) para ajudar a completar o cadastro.
 */

import cron from 'node-cron';
import { db, patients, familyContacts, eq, and } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';

const PRE_MED_NUDGE_HOURS   = 2;
const PRE_MED_MAX_NUDGES    = 2;
const FAMILY_STEP_MINUTES   = 5; // tempo máximo de espera para resposta sobre familiar

const POST_MED_STEPS = ['family_asked', 'family_registered', 'medications_confirmed'];
const PRE_MED_STEPS  = ['welcome_sent', 'medications_requested', 'medications_received'];

function buildFamilyNudgeMessage(firstName: string): string {
  return (
    `${firstName}, seus medicamentos já estão configurados! ✅\n\n` +
    `Deseja cadastrar um *contato familiar* para receber avisos caso esqueça de confirmar?\n\n` +
    `Responda *SIM* (com nome e WhatsApp) ou *NÃO*.\n\n` +
    `_Se não responder, seus lembretes já começarão!_ 💊`
  );
}

function buildPreMedNudgeMessage(firstName: string, step: string, nudgeCount: number): string {
  const isSecond = nudgeCount >= 1;

  if (step === 'welcome_sent') {
    return isSecond
      ? `${firstName}, tudo bem? 🤗 Vi que ainda não configuramos seus lembretes.\n\n` +
        `Quando quiser, é só me responder dizendo quais medicamentos você toma. Estou aqui! 💊`
      : `${firstName}, olá! 👋 Ainda não configuramos seus lembretes de medicamentos.\n\n` +
        `Me diga: *quais medicamentos você toma e em quais horários?* Pode ser uma lista simples! 📋`;
  }

  return isSecond
    ? `${firstName}, conseguiu a lista dos seus medicamentos? 💊\n\n` +
      `Assim que me enviar os nomes e horários, seus lembretes ficam prontos! ✅`
    : `${firstName}, lembrei de você! 🙂\n\n` +
      `Para configurar seus lembretes, preciso saber quais medicamentos você toma e os horários. ` +
      `Me envie a lista quando puder! 📋`;
}

export function startOnboardingNudgeWorker() {
  const whatsapp = new WhatsAppClient();

  // Roda a cada 5 minutos para capturar o threshold curto das etapas pós-meds
  cron.schedule('*/5 * * * *', async () => {
    try {

      // ── ETAPAS PÓS-MEDICAMENTOS: 5 min → 1 aviso → ativa ──────────────────
      const postMedStepsSql = sql.join(
        POST_MED_STEPS.map((s) => sql`${s}`),
        sql`, `,
      );
      const postMedStuck = await db.execute(sql`
        SELECT p.id, p.full_name, p.phone, p.onboarding_step
        FROM patients p
        WHERE p.onboarding_step::text IN (${postMedStepsSql})
          AND p.is_active = true
          AND p.updated_at < NOW() - INTERVAL '${sql.raw(String(FAMILY_STEP_MINUTES))} minutes'
          AND (p.onboarding_nudge_count IS NULL OR p.onboarding_nudge_count < 1)
      `);

      for (const row of postMedStuck.rows as any[]) {
        const firstName = (row.full_name as string).split(' ')[0];
        try {
          await whatsapp.sendTextMessage(row.phone, buildFamilyNudgeMessage(firstName));
          // Ativa imediatamente após o aviso — familiar é opcional, lembrete não pode esperar
          await db.execute(sql`
            UPDATE patients
            SET onboarding_step = 'active', interaction_mode = NULL, agent_session_id = NULL,
                onboarding_nudge_count = 1, updated_at = NOW()
            WHERE id = ${row.id}::uuid
          `);
          logger.info('Paciente ativado após aviso familiar (5 min)', {
            patientId: row.id, step: row.onboarding_step,
          });
        } catch (err: any) {
          logger.error('Falha ao enviar aviso familiar', { error: err.message, patientId: row.id });
        }
      }

      // ── ETAPAS PRÉ-MEDICAMENTOS: 2h → até 2 nudges ─────────────────────────
      const preMedStepsSql = sql.join(
        PRE_MED_STEPS.map((s) => sql`${s}`),
        sql`, `,
      );
      const preMedStuck = await db.execute(sql`
        SELECT p.id, p.full_name, p.phone, p.onboarding_step, p.onboarding_nudge_count
        FROM patients p
        WHERE p.onboarding_step::text IN (${preMedStepsSql})
          AND p.is_active = true
          AND p.updated_at < NOW() - INTERVAL '${sql.raw(String(PRE_MED_NUDGE_HOURS))} hours'
          AND (p.onboarding_nudge_count IS NULL OR p.onboarding_nudge_count < ${PRE_MED_MAX_NUDGES})
      `);

      for (const row of preMedStuck.rows as any[]) {
        const firstName  = (row.full_name as string).split(' ')[0];
        const nudgeCount = Number(row.onboarding_nudge_count ?? 0);
        try {
          await whatsapp.sendTextMessage(
            row.phone,
            buildPreMedNudgeMessage(firstName, row.onboarding_step, nudgeCount),
          );
          await db.execute(sql`
            UPDATE patients
            SET onboarding_nudge_count = COALESCE(onboarding_nudge_count, 0) + 1,
                updated_at = NOW()
            WHERE id = ${row.id}::uuid
          `);
          logger.info('Nudge pré-meds enviado', {
            patientId: row.id, step: row.onboarding_step, nudgeNumber: nudgeCount + 1,
          });
        } catch (err: any) {
          logger.error('Falha ao enviar nudge pré-meds', { error: err.message, patientId: row.id });
        }
      }

      // ── Pacientes pré-meds que esgotaram nudges: avisar familiar se houver ──
      const abandonedPreMed = await db.execute(sql`
        SELECT p.id, p.full_name, p.phone, p.onboarding_step
        FROM patients p
        WHERE p.onboarding_step::text IN (${preMedStepsSql})
          AND p.is_active = true
          AND p.onboarding_nudge_count >= ${PRE_MED_MAX_NUDGES}
          AND p.updated_at < NOW() - INTERVAL '24 hours'
      `);

      for (const row of abandonedPreMed.rows as any[]) {
        const familiar = await db.query.familyContacts.findFirst({
          where: and(eq(familyContacts.patientId, row.id), eq(familyContacts.isActive, true)),
        });
        if (!familiar) continue;

        const firstName = (row.full_name as string).split(' ')[0];
        const msg =
          `Olá, ${familiar.name}! 👋\n\n` +
          `Sou o assistente do *Lembrymed*, o serviço de lembretes de medicamentos ` +
          `que *${firstName}* assinou.\n\n` +
          `Tentamos ajudar ${firstName} a configurar os lembretes, mas não conseguimos ` +
          `finalizar o cadastro. Pode dar um empurrãozinho? 🙂\n\n` +
          `É só pedir para ${firstName} me responder no WhatsApp que concluímos em poucos minutos! 💊`;

        await whatsapp.sendTextMessage(familiar.phone, msg).catch((err: any) =>
          logger.error('Falha ao alertar familiar', { error: err.message, patientId: row.id }),
        );
        await db.execute(sql`
          UPDATE patients
          SET updated_at = NOW(),
              onboarding_nudge_count = onboarding_nudge_count + 1
          WHERE id = ${row.id}::uuid
        `);
        logger.info('Familiar alertado sobre onboarding abandonado', { patientId: row.id });
      }

      if (postMedStuck.rows.length > 0 || preMedStuck.rows.length > 0) {
        logger.info('Onboarding nudge check', {
          postMedActivated: postMedStuck.rows.length,
          preMedNudged: preMedStuck.rows.length,
        });
      }

    } catch (error: any) {
      logger.error('Onboarding nudge worker failed', { error: error.message });
    }
  });

  logger.info('Onboarding nudge worker started — post-med: 5min→ativa; pre-med: 2h→2 nudges');
}
