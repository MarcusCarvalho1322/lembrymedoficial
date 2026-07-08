/**
 * @module Tool Executor Central
 * @description Executa custom tools chamadas pelo Managed Agent de onboarding.
 * Cada tool interage com 360dialog, Neon ou Claude Haiku.
 */

import { db, patients, familyContacts, medications, messageLogs, eq } from '@lembrymed/database';
import { WhatsAppClient } from '../clients/dialog360.client';
import { extractMedications } from './ai.service';
import { logger } from '@lembrymed/shared/logger';

const whatsapp = new WhatsAppClient();

/**
 * Executa uma custom tool do Managed Agent
 * @param name - Nome da tool
 * @param input - Parâmetros da tool
 * @returns Resultado da execução (JSON)
 */
export async function executeTool(
  name: string,
  input: Record<string, any>
): Promise<any> {
  logger.info('Executing tool', { name, input });

  try {
    switch (name) {
      case 'send_whatsapp': {
        const result = await whatsapp.sendTextMessage(input.phone, input.message);
        await db.insert(messageLogs).values({
          phone: input.phone,
          direction: 'outbound',
          content: input.message,
          whatsappMessageId: result.messages?.[0]?.id,
          status: 'sent',
        });
        return { success: true, message_id: result.messages?.[0]?.id };
      }

      case 'save_patient': {
        const [updated] = await db.update(patients)
          .set({ onboardingStep: input.onboarding_step, updatedAt: new Date() })
          .where(eq(patients.phone, input.phone))
          .returning();
        return { success: true, patient_id: updated.id, step: updated.onboardingStep };
      }

      case 'save_family_contact': {
        const patient = await db.query.patients.findFirst({
          where: eq(patients.phone, input.patient_phone),
        });
        if (!patient) return { error: 'Paciente não encontrado' };

        const [contact] = await db.insert(familyContacts).values({
          patientId: patient.id,
          name: input.family_name,
          phone: input.family_phone,
        }).returning();
        return { success: true, contact_id: contact.id };
      }

      case 'parse_medication': {
        return await extractMedications(input.input_type, input.content);
      }

      case 'save_medications': {
        const patient = await db.query.patients.findFirst({
          where: eq(patients.phone, input.patient_phone),
        });
        if (!patient) return { error: 'Paciente não encontrado' };

        const ids: string[] = [];
        for (const med of input.medications) {
          const [row] = await db.insert(medications).values({
            patientId: patient.id,
            name: med.name,
            dosage: med.dosage,
            times: med.times,
            instructions: med.instructions || null,
            isActive: true,
          }).returning();
          ids.push(row.id);
        }
        return { success: true, count: ids.length, medication_ids: ids };
      }

      case 'clear_session': {
        await db.update(patients)
          .set({ agentSessionId: null })
          .where(eq(patients.phone, input.patient_phone));
        return { success: true };
      }

      default:
        logger.warn('Unknown tool', { name });
        return { error: `Tool desconhecida: ${name}` };
    }
  } catch (error: any) {
    logger.error('Tool execution failed', { name, error: error.message });
    return { error: error.message };
  }
}
