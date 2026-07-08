/**
 * @module Worker — Lifecycle Manager
 * @description CRON diário às 09:00 BRT. Gerencia renovações, suspensões,
 * check-ins de adesão e relatório mensal de medicamentos.
 * Sem IA — apenas templates fixos e lógica determinística.
 */

import cron from 'node-cron';
import { db, subscriptions, patients, medications, familyContacts, eq, and } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { WhatsAppClient } from '../clients/dialog360.client';
import { createPaymentLink } from '../services/stripe.service';
import { logger } from '@lembrymed/shared/logger';
import { addDaysBRT, getTodayBRT, getNowBRT } from '../lib/brt';
import { buildMonthlyReportText } from '../lib/report-builder';
import { invalidateAndSync } from '../lib/med-schedule-cache';

// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL — dispara no dia 1º de cada mês às 09:00 BRT
// ═══════════════════════════════════════════════════════════

async function sendMonthlyReports(whatsapp: WhatsAppClient): Promise<void> {
  // Calcular mês anterior (referência do relatório)
  const now      = getNowBRT();
  const year     = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month    = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-12
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay  = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const monthLabel = `${monthNames[month - 1]}/${year}`;

  logger.info('Gerando relatórios mensais', { period: monthLabel, firstDay, lastDay });

  // Buscar todos os pacientes ativos com ao menos 1 confirmação no mês
  const activePatientsWithData = await db.execute(sql`
    SELECT DISTINCT p.id, p.full_name, p.phone
    FROM patients p
    JOIN medication_confirmations mc ON mc.patient_id = p.id
    WHERE p.is_active = true
      AND p.onboarding_step = 'active'
      AND mc.date >= ${firstDay}::date
      AND mc.date <= ${lastDay}::date
  `);

  logger.info('Pacientes com dados para relatório', { count: activePatientsWithData.rows.length });

  for (const patient of activePatientsWithData.rows as any[]) {
    try {
      // Buscar adesão por medicamento no mês
      const medStats = await db.execute(sql`
        SELECT
          m.name,
          m.dosage,
          COUNT(*) FILTER (WHERE mc.confirmation_status = 'confirmed')   as confirmed,
          COUNT(*) FILTER (WHERE mc.confirmation_status = 'denied')      as denied,
          COUNT(*) FILTER (WHERE mc.confirmation_status = 'no_response') as no_response,
          COUNT(*) as total_doses
        FROM medication_confirmations mc
        JOIN medications m ON m.id = mc.medication_id
        WHERE mc.patient_id = ${patient.id}::uuid
          AND mc.date >= ${firstDay}::date
          AND mc.date <= ${lastDay}::date
        GROUP BY m.id, m.name, m.dosage
        ORDER BY m.name
      `);

      if (medStats.rows.length === 0) continue;

      const meds = (medStats.rows as any[]).map((r) => ({
        name:       r.name,
        dosage:     r.dosage,
        totalDoses: Number(r.total_doses),
        confirmed:  Number(r.confirmed),
        denied:     Number(r.denied),
        noResponse: Number(r.no_response),
      }));

      // 1. Enviar relatório ao paciente
      const patientReport = buildMonthlyReportText(
        patient.full_name, monthLabel, meds, false,
      );
      await whatsapp.sendTextMessage(patient.phone, patientReport);
      logger.info('Relatório mensal enviado ao paciente', { patient: patient.full_name });

      // 2. Enviar ao familiar (se houver)
      const familiar = await db.query.familyContacts.findFirst({
        where: and(
          eq(familyContacts.patientId, patient.id),
          eq(familyContacts.isActive, true),
        ),
      });

      if (familiar) {
        const familyReport = buildMonthlyReportText(
          patient.full_name, monthLabel, meds, true, familiar.name,
        );
        await whatsapp.sendTextMessage(familiar.phone, familyReport);
        logger.info('Relatório mensal enviado ao familiar', {
          patient: patient.full_name, familiar: familiar.name,
        });
      }

      // Pequena pausa para não sobrecarregar o Z-API
      await new Promise((res) => setTimeout(res, 500));

    } catch (err: any) {
      logger.error('Falha ao gerar relatório mensal', {
        error: err.message, patientId: patient.id,
      });
    }
  }

  logger.info('Relatórios mensais concluídos', { period: monthLabel });
}

// ═══════════════════════════════════════════════════════════
// WORKER PRINCIPAL
// ═══════════════════════════════════════════════════════════

export function startLifecycleWorker() {
  const whatsapp = new WhatsAppClient();

  // 09:00 BRT todos os dias (12:00 UTC)
  cron.schedule('0 12 * * *', async () => {
    logger.info('Lifecycle cycle started');

    try {
      const nowBRT = getNowBRT();

      // Data atual em BRT no formato YYYY-MM-DD — usada em queries SQL que
      // precisam de comparação de data no timezone correto (evita bug UTC vs BRT).
      const todayBRT = getTodayBRT();

      // ═══ RELATÓRIO MENSAL — só no dia 1º de cada mês ═══
      if (nowBRT.getDate() === 1) {
        await sendMonthlyReports(whatsapp);
      }

      // ═══ RENOVAÇÕES ═══
      // Usamos data BRT (não UTC) para decidir "faltam 30/15/3 dias" — evita
      // disparar lembrete 1 dia errado entre 21:00 e 23:59 BRT.
      for (const days of [30, 15, 3]) {
        const targetStr = addDaysBRT(days);

        const field = days === 30 ? 'renewal_reminder_30d_sent'
                    : days === 15 ? 'renewal_reminder_15d_sent'
                    : 'renewal_reminder_3d_sent';

        const expiring = await db.execute(sql`
          SELECT s.id as sub_id, s.expires_at,
                 p.id as patient_id, p.full_name, p.phone
          FROM subscriptions s
          JOIN patients p ON p.id = s.patient_id
          WHERE s.status = 'active'
            AND DATE(s.expires_at) = ${targetStr}
            AND s.${sql.raw(field)} = false
        `);

        for (const sub of expiring.rows as any[]) {
          // FIX: createPaymentLink em try-catch individual — falha no Stripe de
          // um paciente não deve bloquear o envio para os demais.
          try {
            const link       = await createPaymentLink(sub.patient_id);
            const expiryDate = new Date(sub.expires_at).toLocaleDateString('pt-BR');
            const firstName  = (sub.full_name as string).split(' ')[0];

            let msg: string;
            if (days === 30) {
              msg = `Olá, ${firstName}! 👋\n\n` +
                `Sua assinatura do Lembrymed vence em 30 dias (${expiryDate}).\n` +
                `Para continuar recebendo seus lembretes:\n${link.url}\n\n` +
                `Qualquer dúvida, responda esta mensagem!`;
            } else if (days === 15) {
              msg = `${firstName}, sua assinatura vence em 15 dias (${expiryDate}).\n\n` +
                `Renove para não perder seus lembretes:\n${link.url}`;
            } else {
              msg = `⚠️ ${firstName}, sua assinatura vence em 3 dias!\n\n` +
                `Sem renovação, seus lembretes serão pausados em ${expiryDate}.\n` +
                `Renove agora:\n${link.url}`;
            }

            await whatsapp.sendTextMessage(sub.phone, msg);

            const updateData: any = { updatedAt: new Date() };
            updateData[field === 'renewal_reminder_30d_sent' ? 'renewalReminder30dSent' :
                       field === 'renewal_reminder_15d_sent' ? 'renewalReminder15dSent' :
                       'renewalReminder3dSent'] = true;

            await db.update(subscriptions).set(updateData)
              .where(eq(subscriptions.id, sub.sub_id));

            logger.info('Renewal reminder sent', { patient: firstName, days });
          } catch (err: any) {
            logger.error('Renewal reminder failed for patient', {
              patientId: sub.patient_id, days, error: err.message,
            });
          }
        }
      }

      // ═══ SUSPENSÕES ═══
      const expired = await db.execute(sql`
        SELECT s.id as sub_id, s.patient_id, p.full_name, p.phone
        FROM subscriptions s
        JOIN patients p ON p.id = s.patient_id
        WHERE s.status = 'active' AND s.expires_at < NOW()
      `);

      for (const sub of expired.rows as any[]) {
        // FIX: suspensão em try-catch individual — falha no Stripe/WhatsApp de
        // um paciente não deve impedir a suspensão dos demais expirados.
        try {
          await db.update(subscriptions)
            .set({ status: 'suspended', updatedAt: new Date() })
            .where(eq(subscriptions.id, sub.sub_id));

          await db.update(medications)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(medications.patientId, sub.patient_id));

          const link = await createPaymentLink(sub.patient_id);
          const firstName = (sub.full_name as string).split(' ')[0];
          await whatsapp.sendTextMessage(sub.phone,
            `😔 ${firstName}, sua assinatura do Lembrymed expirou.\n` +
            `Seus lembretes foram pausados.\n\n` +
            `Para reativar:\n${link.url}\n` +
            `Sentimos sua falta! 💊`
          );

          logger.info('Subscription suspended', { patient: sub.full_name });
        } catch (err: any) {
          logger.error('Suspension failed for patient', {
            patientId: sub.patient_id, error: err.message,
          });
        }
      }

      // Após processar todas as suspensões, atualizar cache Redis (best-effort)
      if (expired.rows.length > 0) {
        invalidateAndSync().catch(() => {});
      }

      // ═══ CHECK-IN DE PACIENTES REINCIDENTES ═══
      // 3+ dias consecutivos sem confirmar → mensagem de cuidado ao paciente.
      // FIX: usa todayBRT (não CURRENT_DATE que é UTC) para evitar bug de
      // cruzamento de meia-noite entre 21:00 e 23:59 BRT.
      const noResponsePatients = await db.execute(sql`
        SELECT
          p.id,
          p.full_name,
          p.phone,
          COUNT(DISTINCT mc.date) as days_no_response
        FROM patients p
        JOIN medication_confirmations mc ON mc.patient_id = p.id
        WHERE p.is_active = true
          AND p.onboarding_step = 'active'
          AND mc.date >= ${todayBRT}::date - INTERVAL '3 days'
          AND mc.date < ${todayBRT}::date
        GROUP BY p.id, p.full_name, p.phone
        HAVING
          COUNT(DISTINCT mc.date) FILTER (WHERE mc.confirmation_status = 'confirmed') = 0
          AND COUNT(DISTINCT mc.date) FILTER (WHERE mc.confirmation_status = 'no_response') >= 3
      `);

      for (const row of noResponsePatients.rows as any[]) {
        try {
          const firstName = (row.full_name as string).split(' ')[0];
          await whatsapp.sendTextMessage(row.phone,
            `${firstName}, tudo bem? 🤗\n\n` +
            `Percebi que você não confirmou seus medicamentos nos últimos dias.\n\n` +
            `Não precisa explicar nada — mas se precisar de ajuda para ajustar ` +
            `horários ou tiver algum problema, é só me chamar aqui. 💊\n\n` +
            `Estou aqui para te ajudar a cuidar da sua saúde! 🌟`
          );
          logger.info('Check-in enviado para paciente reincidente', {
            patient: row.full_name, daysNoResponse: row.days_no_response,
          });
        } catch (err: any) {
          logger.error('Check-in falhou para paciente', {
            patientId: row.id, error: err.message,
          });
        }
      }

      // ═══ LGPD — RETENÇÃO DE DADOS ═══
      // Anonimiza `message_logs.content` com mais de 90 dias. Mantemos
      // metadados (direção, timestamp, phone mascarado) para métricas,
      // mas removemos o TEXTO da conversa (PII sensível de saúde — LGPD Art. 18).
      try {
        const retention = await db.execute(sql`
          UPDATE message_logs
          SET content = '[removed by retention policy]', media_url = NULL
          WHERE created_at < NOW() - INTERVAL '90 days'
            AND content IS NOT NULL
            AND content != '[removed by retention policy]'
        `);
        const count = (retention as any).rowCount ?? 0;
        if (count > 0) {
          logger.info('Retention: message_logs anonimizados', { count, policy: '90d' });
        }
      } catch (err: any) {
        logger.error('Retention message_logs falhou', { error: err.message });
      }

      // Anonimiza `reminder_logs` com mais de 90 dias.
      // `scheduled_for` é NOT NULL — usamos epoch como sentinel.
      // `medication_time` → '00:00', `whatsapp_message_id` → '[removed]'.
      // Mantemos apenas o tipo (reminder_type) e status para métricas de adesão.
      try {
        const retentionReminders = await db.execute(sql`
          UPDATE reminder_logs
          SET medication_time = '00:00',
              scheduled_for = '1970-01-01 00:00:00+00'::timestamptz,
              whatsapp_message_id = '[removed]'
          WHERE created_at < NOW() - INTERVAL '90 days'
            AND medication_time != '00:00'
        `);
        const count = (retentionReminders as any).rowCount ?? 0;
        if (count > 0) {
          logger.info('Retention: reminder_logs anonimizados', { count, policy: '90d' });
        }
      } catch (err: any) {
        logger.error('Retention reminder_logs falhou', { error: err.message });
      }

      // Purga `admin_audit_logs` com mais de 180 dias (logs operacionais, não PII).
      // LGPD Art. 37 exige registro de operações — 180 dias é razoável para auditoria.
      try {
        const retentionAudit = await db.execute(sql`
          DELETE FROM admin_audit_logs
          WHERE created_at < NOW() - INTERVAL '180 days'
        `);
        const count = (retentionAudit as any).rowCount ?? 0;
        if (count > 0) {
          logger.info('Retention: admin_audit_logs purgados', { count, policy: '180d' });
        }
      } catch (err: any) {
        logger.error('Retention admin_audit_logs falhou', { error: err.message });
      }

      logger.info('Lifecycle cycle completed');
    } catch (error: any) {
      logger.error('Lifecycle cycle failed', { error: error.message });
    }
  });

  logger.info('Lifecycle worker scheduled (09:00 BRT daily | monthly report: day 1 | retention 90d)');
}
