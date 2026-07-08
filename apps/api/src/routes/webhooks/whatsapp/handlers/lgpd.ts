/**
 * @module Webhook WhatsApp — Handlers LGPD
 *
 * Responde a palavras-chave do paciente (EXCLUIR / EXPORTAR MEUS DADOS).
 * A execução REAL ocorre em backoffice — aqui confirmamos recebimento,
 * registramos o pedido em messageLogs e notificamos o admin.
 */

import { db, messageLogs } from '@lembrymed/database';
import { logger } from '@lembrymed/shared/logger';
import { env } from '../../../../config/env';
import { WhatsAppClient } from '../../../../clients/dialog360.client';

const whatsapp = new WhatsAppClient();

export async function handleLgpdDeletionRequest(
  patient: { id: string; fullName: string; phone: string },
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de deleção recebido via WhatsApp', { patientId: patient.id });

  await db.insert(messageLogs).values({
    patientId: patient.id,
    phone: patient.phone,
    direction: 'inbound',
    content: '[LGPD_DELETION_REQUEST]',
    status: 'sent',
  }).catch((err: Error) => logger.warn('Falha ao logar LGPD request', { error: err.message }));

  await whatsapp.sendTextMessage(patient.phone,
    `${firstName}, recebemos sua solicitação de *exclusão dos dados*. 🗂️\n\n` +
    `Conforme a LGPD (Lei 13.709/2018), temos até 15 dias para processar. ` +
    `Nossa equipe vai validar e entrar em contato para confirmar.\n\n` +
    `Se foi engano, é só responder *CANCELAR* em até 24h. Caso contrário, ` +
    `após a confirmação seus dados serão apagados permanentemente e você ` +
    `não receberá mais lembretes.\n\n` +
    `Dúvidas: privacidade@lembrymed.com.br`,
  ).catch((err: Error) => logger.warn('Falha ao responder LGPD', { error: err.message }));

  const adminNumber = env.ADMIN_WHATSAPP;
  if (adminNumber) {
    await whatsapp.sendTextMessage(adminNumber,
      `⚠️ LGPD — pedido de EXCLUSÃO de dados recebido\n\n` +
      `Paciente: ${patient.fullName}\n` +
      `Telefone: ${patient.phone}\n` +
      `ID: ${patient.id}\n\n` +
      `Abra /admin/patient/${patient.phone} para revisar e deletar se apropriado.`,
    ).catch(() => {});
  }
}

export async function handleLgpdExportRequest(
  patient: { id: string; fullName: string; phone: string },
): Promise<void> {
  const firstName = patient.fullName.split(' ')[0];
  logger.info('LGPD: pedido de exportação recebido via WhatsApp', { patientId: patient.id });

  await db.insert(messageLogs).values({
    patientId: patient.id,
    phone: patient.phone,
    direction: 'inbound',
    content: '[LGPD_EXPORT_REQUEST]',
    status: 'sent',
  }).catch(() => {});

  await whatsapp.sendTextMessage(patient.phone,
    `${firstName}, recebemos seu pedido de *exportação dos dados*. 📄\n\n` +
    `Vamos preparar um arquivo JSON/CSV com todo seu histórico: medicamentos, ` +
    `confirmações, lembretes enviados e contato familiar cadastrado.\n\n` +
    `Você receberá o link de download por e-mail em até 5 dias úteis.\n\n` +
    `Dúvidas: privacidade@lembrymed.com.br`,
  ).catch((err: Error) => logger.warn('Falha ao responder LGPD export', { error: err.message }));

  const adminNumber = env.ADMIN_WHATSAPP;
  if (adminNumber) {
    await whatsapp.sendTextMessage(adminNumber,
      `📄 LGPD — pedido de EXPORTAÇÃO recebido\n\n` +
      `Paciente: ${patient.fullName}\n` +
      `Telefone: ${patient.phone}\n` +
      `ID: ${patient.id}\n\n` +
      `Use GET /admin/patients/${patient.id}/export e envie ao paciente.`,
    ).catch(() => {});
  }
}
