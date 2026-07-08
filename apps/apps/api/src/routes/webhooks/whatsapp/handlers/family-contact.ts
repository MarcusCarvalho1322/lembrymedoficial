/**
 * @module Webhook WhatsApp — Persistência de familyContact
 *
 * Salva (ou substitui) o contato familiar ativo de um paciente. Notifica
 * o familiar anterior se houve substituição. Validações de telefone BR
 * + tamanho do nome.
 */

import { db, familyContacts, eq, and } from '@lembrymed/database';
import { logger } from '@lembrymed/shared/logger';
import { WhatsAppClient } from '../../../../clients/dialog360.client';
import { validateFamilyPhone } from '../../../../lib/phone';

const whatsapp = new WhatsAppClient();

export async function saveFamilyContact(
  patientId: string,
  name: string,
  phone: string,
  patientName: string,
): Promise<boolean> {
  const validPhone = validateFamilyPhone(phone);
  if (!validPhone) {
    logger.warn('Familiar rejeitado: telefone inválido', {
      patientId,
      phoneSnippet: phone.substring(0, 6) + '...',
      nameSnippet: name.substring(0, 20),
    });
    return false;
  }

  const cleanName = name.trim();
  if (cleanName.length < 2 || cleanName.length > 120) {
    logger.warn('Familiar rejeitado: nome inválido', { patientId, nameLen: cleanName.length });
    return false;
  }

  try {
    const [previousFamily] = await db.query.familyContacts.findMany({
      where: and(eq(familyContacts.patientId, patientId), eq(familyContacts.isActive, true)),
      columns: { name: true, phone: true },
      limit: 1,
    });

    await db.update(familyContacts)
      .set({ isActive: false })
      .where(eq(familyContacts.patientId, patientId));

    await db.insert(familyContacts).values({
      patientId,
      name:     cleanName,
      phone:    validPhone,
      isActive: true,
    });

    if (previousFamily && previousFamily.phone !== validPhone) {
      const patientFirst  = patientName.split(' ')[0];
      const prevFirst     = previousFamily.name.split(' ')[0];
      await whatsapp.sendTextMessage(
        previousFamily.phone,
        `Olá, *${prevFirst}*! O paciente *${patientFirst}* atualizou o contato familiar no Lembrymed. ` +
        `Você não receberá mais alertas. Obrigado por ter nos ajudado a cuidar da sua família 💙`,
      ).catch((err: Error) => logger.warn('Falha ao notificar familiar removido', {
        error: err.message, phone: previousFamily.phone.substring(0, 8) + '****',
      }));
      logger.info('Familiar anterior notificado da substituição', {
        patientId, prevName: previousFamily.name, newName: cleanName,
      });
    }

    logger.info('Familiar salvo com sucesso', { patientId, name: cleanName });
    return true;
  } catch (err: any) {
    logger.error('Falha ao salvar familiar', { error: err.message, patientId, name: cleanName });
    return false;
  }
}
