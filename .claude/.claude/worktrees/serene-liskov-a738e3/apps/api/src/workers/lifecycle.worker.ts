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

/**
 * Adiciona N dias a hoje em BRT e retorna a data no formato YYYY-MM-DD.
 * Correção do bug anterior que usava `new Date()` local (UTC no Railway)
 * — perto da meia-noite, calculava 1 dia a menos.
 */
function addDaysBRT(days: number): string {
  const nowUtc = new Date();
  // Shift para BRT: -3h
  const brt = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);
  brt.setUTCDate(brt.getUTCDate() + days);
  // Formatar YYYY-MM-DD sem time
  return brt.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════
// HELPER — Gerar texto do relatório mensal de adesão
// ═══════════════════════════════════════════════════════════

interface MedReport {
  name: string;
  dosage: string;
  totalDoses: number;
  confirmed: number;
  denied: number;
  noResponse: number;
}

function buildMonthlyReportText(
  patientName: string,
  month: string,        // ex: "Janeiro/2026"
  meds: MedReport[],
  forFamily: boolean,
  familyName?: string,
): string {
  const firstName = patientName.split(' ')[0];

  const totalDoses     = meds.reduce((s, m) => s + m.totalDoses, 0);
  const totalConfirmed = meds.reduce((s, m) => s + m.confirmed,  0);
  const adherencePct   = totalDoses > 0
    ? Math.round((totalConfirmed / totalDoses) * 100)
    : 0;

  const medalha =
    adherencePct >= 90 ? '🏆 Excelente' :
    adherencePct >= 75 ? '✅ Boa'       :
    adherencePct >= 50 ? '⚠️ Regular'  :
                         '❌ Baixa';

  const header = forFamily
    ? `📋 *Relatório de Medicamentos — ${month}*\n` +
      `Paciente: *${patientName}*\n` +
      `Olá, ${familyName}! Segue o relatório mensal de adesão aos medicamentos.\n\n`
    : `📋 *Seu Relatório de Medicamentos — ${month}*\n` +
      `${firstName}, aqui está seu resumo de adesão do mês! Guarde para mostrar ao seu médico. 👨‍⚕️\n\n`;

  const medLines = meds.map((m) => {
    const pct = m.totalDoses > 0 ? Math.round((m.confirmed / m.totalDoses) * 100) : 0;
    const bar = '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return (
      `💊 *${m.name} ${m.dosage}*\n` +
      `   ${bar} ${pct}%\n` +
      `   ✅ Confirmadas: ${m.confirmed}/${m.totalDoses} doses\n` +
      (m.denied     > 0 ? `   ❌ Não tomadas: ${m.denied}\n`         : '') +
      (m.noResponse > 0 ? `   ⏳ Sem resposta: ${m.noResponse}\n`    : '')
    );
  }).join('\n');

  const footer = forFamily
    ? `\n📊 *Adesão geral: ${adherencePct}% — ${medalha}*\n\n` +
      `Este relatório foi gerado automaticamente pelo *Lembrymed*.\n` +
      `Leve ao médico de ${firstName} na próxima consulta! 🩺`
    : `\n📊 *Sua adesão geral: ${adherencePct}% — ${medalha}*\n\n` +
      `Leve este relatório ao seu médico na próxima consulta! 🩺\n` +
      `O Lembrymed continua aqui para te ajudar a cuidar da sua saúde. 💙`;

  return header + medLines + footer;
}

// ═══════════════════════════════════════════════════════════
// RELATÓRIO MENSAL — dispara no dia 1º de cada mês às 09:00 BRT
// ═══════════════════════════════════════════════════════════

async function sendMonthlyReports(whatsapp: WhatsAppClient): Promise<void> {
  // Calcular mês anterior (referência do relatório)
  const now      = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
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

      const meds: MedReport[] = (medStats.rows as any[]).map((r) => ({
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
      const nowBRT = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));

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
      }

      // ═══ CHECK-IN DE PACIENTES REINCIDENTES ═══
      // 3+ dias consecutivos sem confirmar → mensagem de cuidado ao paciente
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
          AND mc.date >= CURRENT_DATE - INTERVAL '3 days'
          AND mc.date < CURRENT_DATE
        GROUP BY p.id, p.full_name, p.phone
        HAVING
          COUNT(DISTINCT mc.date) FILTER (WHERE mc.confirmation_status = 'confirmed') = 0
          AND COUNT(DISTINCT mc.date) FILTER (WHERE mc.confirmation_status = 'no_response') >= 3
      `);

      for (const row of noResponsePatients.rows as any[]) {
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
      }

      // ═══ LGPD — RETENÇÃO DE DADOS ═══
      // Anonimiza `message_logs.content` com mais de 90 dias. Mantemos
      // metadados (direção, timestamp, phone mascarado) para métricas,
      // mas removemos o TEXTO da conversa (que é PII sensível de saúde).
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

      logger.info('Lifecycle cycle completed');
    } catch (error: any) {
      logger.error('Lifecycle cycle failed', { error: error.message });
    }
  });

  logger.info('Lifecycle worker scheduled (09:00 BRT daily | monthly report: day 1 | retention 90d)');
}
