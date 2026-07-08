/**
 * @module Admin — Controle de Renovações
 * @description Lista assinaturas próximas do vencimento e permite ação manual.
 */

import { Router } from 'express';
import { db, subscriptions, patients, eq } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../../clients/dialog360.client';
import { createPaymentLink } from '../../services/stripe.service';

const router = Router();
const whatsapp = new WhatsAppClient();

/** Lista assinaturas vencendo nos próximos 30 dias */
router.get('/admin/renewals', async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT
        s.id as sub_id, s.expires_at, s.status, s.amount_cents,
        s.renewal_reminder_30d_sent, s.renewal_reminder_15d_sent, s.renewal_reminder_3d_sent,
        p.id as patient_id, p.full_name, p.phone, p.email,
        EXTRACT(DAY FROM s.expires_at - NOW()) as days_remaining
      FROM subscriptions s
      JOIN patients p ON p.id = s.patient_id
      WHERE s.status = 'active'
        AND s.expires_at <= NOW() + INTERVAL '30 days'
      ORDER BY s.expires_at ASC
    `);

    res.json({ renewals: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Enviar lembrete manual de renovação */
router.post('/admin/renewals/:subId/remind', async (req, res) => {
  try {
    const sub = await db.execute(sql`
      SELECT s.*, p.full_name, p.phone
      FROM subscriptions s
      JOIN patients p ON p.id = s.patient_id
      WHERE s.id = ${req.params.subId}::uuid
    `);

    if (!sub.rows.length) return res.status(404).json({ error: 'Assinatura não encontrada' });

    const row = sub.rows[0] as any;
    const link = await createPaymentLink(row.patient_id);
    const expiryDate = new Date(row.expires_at).toLocaleDateString('pt-BR');

    await whatsapp.sendTextMessage(row.phone,
      `Olá, ${row.full_name}! 👋\n\n` +
      `Sua assinatura do Lembrymed vence em ${expiryDate}.\n` +
      `Para continuar recebendo seus lembretes:\n${link.url}\n\n` +
      `Qualquer dúvida, responda esta mensagem!`
    );

    res.json({ success: true, message: 'Lembrete enviado' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
