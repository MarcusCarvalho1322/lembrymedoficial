/**
 * @module Webhook WhatsApp — Resposta do familiar à solicitação de cadastro
 *
 * Quando um familiar (número desconhecido) responde à mensagem do
 * Lembrymed pedindo confirmação, esse handler:
 *  - Detecta SIM/NÃO (vocabulário ampliado via hasAffirmation/hasRemoveIntent)
 *  - Se SIM: salva em family_contacts + notifica paciente
 *  - Se NÃO: descarta + notifica paciente
 *  - Se ambíguo: re-pergunta (mantém pendência Redis)
 *
 * Onda 4 (M7): hasAffirmation/hasRemoveIntent ampliam o vocabulário aceito
 * comparado ao SIM/NÃO literal anterior.
 */

import { redis } from '../../../../config/redis';
import { logger } from '@lembrymed/shared/logger';
import { WhatsAppClient } from '../../../../clients/dialog360.client';
import { FAMILY_CONFIRM_KEY, PATIENT_PENDING_KEY, type PendingFamilyConfirm } from '../constants';
import { hasAffirmation, hasRemoveIntent } from '../../../../lib/marker-validation';
import { saveFamilyContact } from './family-contact';

const whatsapp = new WhatsAppClient();

// Vocabulário estrito mantido para o caminho "happy path" rápido — palavras
// curtas e inequívocas. Para tudo além disso, caímos no hasAffirmation/
// hasRemoveIntent que é mais permissivo.
const STRICT_SIM = ['SIM', 'S', 'SI', 'YES', '1', 'ACEITO', 'ACEITAR', 'CONFIRMO', 'OK'];
const STRICT_NAO = ['NÃO', 'NAO', 'N', 'NO', '0', 'RECUSO', 'RECUSAR', 'NEGAR', 'NÃO ACEITO', 'NAO ACEITO'];

export async function handleFamilyConfirmationFromMember(
  familyPhone: string,
  text: string,
  pending: PendingFamilyConfirm,
): Promise<void> {
  const normalized   = text.trim().toUpperCase();
  const familyFirst  = pending.familyName.split(' ')[0];
  const patientFirst = pending.patientName.split(' ')[0];

  // 1ª tentativa: match estrito (palavras curtas conhecidas)
  let accepted = STRICT_SIM.includes(normalized);
  let refused  = STRICT_NAO.includes(normalized);

  // 2ª tentativa (Onda 4 / M7): vocabulário ampliado da lib.
  // Aceita variações como "pode cadastrar", "claro", "com certeza", etc.
  if (!accepted && !refused) {
    if (hasAffirmation(text))      accepted = true;
    else if (hasRemoveIntent(text)) refused = true;
  }

  if (!accepted && !refused) {
    // Mensagem ambígua → re-perguntar (mantém chave Redis, não deleta)
    await whatsapp.sendTextMessage(
      familyPhone,
      `${familyFirst}, não entendi sua resposta 😊\n\n` +
      `*${patientFirst}* quer te cadastrar como contato de emergência no Lembrymed.\n\n` +
      `Responda apenas *SIM* para aceitar ou *NÃO* para recusar.`,
    );
    logger.info('Resposta ambígua do familiar — re-perguntando', {
      familyPhone: familyPhone.substring(0, 8) + '****', normalized,
    });
    return;
  }

  // Deletar chaves Redis independente da resposta
  await redis.del(FAMILY_CONFIRM_KEY(familyPhone));
  await redis.del(FAMILY_CONFIRM_KEY(pending.familyPhone));
  await redis.del(PATIENT_PENDING_KEY(pending.patientId));

  if (accepted) {
    await saveFamilyContact(pending.patientId, pending.familyName, pending.familyPhone, pending.patientName);

    await whatsapp.sendTextMessage(
      familyPhone,
      `✅ *Cadastro confirmado, ${familyFirst}!*\n\n` +
      `Você receberá avisos no WhatsApp caso *${patientFirst}* esqueça de confirmar que tomou um medicamento.\n\n` +
      `Obrigado por cuidar da saúde de quem você ama! 💙`,
    );

    await whatsapp.sendTextMessage(
      pending.patientPhone,
      `✅ *${pending.familyName} aceitou!*\n\n` +
      `Ele(a) será avisado(a) pelo WhatsApp caso você esqueça de confirmar um medicamento. 👨‍👩‍👧\n\n` +
      `Você pode alterar ou remover esse contato a qualquer momento me enviando uma mensagem.`,
    );

    logger.info('Familiar confirmado e salvo com sucesso', {
      patientId: pending.patientId, familyName: pending.familyName,
    });
  } else {
    await whatsapp.sendTextMessage(
      familyPhone,
      `Tudo bem, ${familyFirst}! 😊\n\n` +
      `Sua recusa foi registrada. Você não receberá mais mensagens do Lembrymed.\n\n` +
      `Caso mude de ideia, peça para *${patientFirst}* te adicionar novamente.`,
    );

    await whatsapp.sendTextMessage(
      pending.patientPhone,
      `ℹ️ *${pending.familyName} recusou o cadastro.*\n\n` +
      `Sem problemas! Você pode cadastrar outro familiar a qualquer momento enviando uma mensagem aqui. 👨‍👩‍👧`,
    );

    logger.info('Familiar recusou o cadastro', {
      patientId: pending.patientId, familyName: pending.familyName,
    });
  }
}
