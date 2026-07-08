/**
 * @module Worker — Family Alerter
 * @description Executa 30min após T+10. Verifica se o paciente confirmou.
 * Se não confirmou, envia alerta ao familiar cadastrado.
 *
 * REGRA DE DEDUPLICAÇÃO:
 * O familiar recebe no máximo 1 alerta por dia por paciente — independente
 * de quantos medicamentos o paciente deixou de confirmar.
 * Isso evita spam que levaria o familiar a bloquear o número.
 */

import { Worker } from 'bullmq';
import { db, medicationConfirmations, familyContacts, patients,
         medications, familyAlertLogs, eq, and } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { env } from '../config/env';
import { familyAlertQueue } from '../config/queues';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';
import type { FamilyAlertJobData } from '@lembrymed/shared/types';
import { getTodayBRT } from '../lib/brt';

export function startFamilyAlerter() {
  const whatsapp = new WhatsAppClient();

  const worker = new Worker<FamilyAlertJobData>('family-alert', async (job) => {
    const { patient_id, medication_id, medication_time } = job.data;
    const todayBRT = getTodayBRT();

    // Verificar se paciente já confirmou
    const confirmation = await db.execute(sql`
      SELECT id FROM medication_confirmations
      WHERE patient_id = ${patient_id}::uuid
        AND medication_id = ${medication_id}::uuid
        AND medication_time = ${medication_time}::time
        AND date = ${todayBRT}::date
        AND confirmation_status = 'confirmed'
      LIMIT 1
    `);

    if (confirmation.rows.length > 0) {
      logger.debug('Paciente já confirmou — alerta familiar cancelado', { patient_id });
      return;
    }

    // Buscar familiar ativo
    const family = await db.query.familyContacts.findFirst({
      where: and(
        eq(familyContacts.patientId, patient_id),
        eq(familyContacts.isActive, true),
      ),
    });

    // Registrar no_response independente de ter familiar
    await db.insert(medicationConfirmations).values({
      patientId:          patient_id,
      medicationId:       medication_id,
      confirmationStatus: 'no_response',
      medicationTime:     medication_time,
      date:               todayBRT,
      familyAlerted:      !!family,
      familyAlertSentAt:  family ? new Date() : null,
    }).onConflictDoNothing();

    if (!family) {
      logger.info('Sem familiar cadastrado — no_response registrado', { patient_id });
      return;
    }

    // ── Deduplicação diária: familiar recebe no máximo 1 alerta por dia ────────
    // Verificar se já enviamos qualquer alerta para esse familiar hoje
    const alreadyAlertedToday = await db.execute(sql`
      SELECT id FROM family_alert_logs
      WHERE patient_id = ${patient_id}::uuid
        AND family_contact_id = ${family.id}::uuid
        AND date = ${todayBRT}::date
        AND status = 'sent'
      LIMIT 1
    `);

    if (alreadyAlertedToday.rows.length > 0) {
      logger.debug('Familiar já foi alertado hoje — deduplicado', {
        patient_id, familyId: family.id,
      });
      return; // silencioso — o familiar já sabe
    }

    // Buscar dados do paciente
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, patient_id),
    });
    const med = await db.query.medications.findFirst({
      where: eq(medications.id, medication_id),
    });

    if (!patient || !med) return;

    // Enviar alerta (1 por dia, independente de quantos meds não confirmados)
    const hora = medication_time.slice(0, 5); // "HH:MM"
    const alertMsg =
      `⚠️ Atenção, ${family.name}!\n\n` +
      `*${patient.fullName.split(' ')[0]}* não confirmou que tomou ` +
      `*${med.name} ${med.dosage}* às ${hora}.\n\n` +
      `Por favor, verifique se está tudo bem com ele(a). 🙏`;

    const result = await whatsapp.sendTextMessage(family.phone, alertMsg);

    // Registrar alerta
    await db.insert(familyAlertLogs).values({
      patientId:         patient_id,
      familyContactId:   family.id,
      medicationId:      medication_id,
      medicationTime:    medication_time,
      date:              todayBRT,
      sentAt:            new Date(),
      whatsappMessageId: result.messages?.[0]?.id,
      status:            'sent',
    });

    logger.info('Alerta familiar enviado (1 por dia)', {
      patient: patient.fullName,
      family:  family.name,
      med:     med.name,
    });
  }, {
    connection: { url: env.REDIS_URL },
    concurrency: 5,
  });

  worker.on('error', (err) => logger.error('Family alerter error', { error: err.message }));
  logger.info('Family alerter started (dedup: 1 alerta/dia por paciente)');

  return worker;
}
