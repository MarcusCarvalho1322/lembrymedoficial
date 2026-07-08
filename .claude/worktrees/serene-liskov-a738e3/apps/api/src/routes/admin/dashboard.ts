/**
 * @module Admin — Dashboard KPIs
 * @description Retorna métricas em tempo real para o painel administrativo.
 * TIMEZONE: Todas as queries de "hoje" usam America/Sao_Paulo para evitar
 * desvio nas métricas após 21h BRT (quando UTC já virou para o dia seguinte).
 */

import { Router } from 'express';
import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { logger } from '@lembrymed/shared/logger';

const router = Router();

/**
 * Retorna a data de hoje no fuso de Brasília no formato YYYY-MM-DD.
 * Evita o bug de CURRENT_DATE (UTC) que mostra dados errados das 21h às 23h59 BRT.
 */
function getTodayBRT(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());
}

router.get('/admin/dashboard', async (_req, res) => {
  try {
    const todayBRT = getTodayBRT(); // Ex: "2025-08-15"

    const kpisResult = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM patients WHERE is_active = true AND onboarding_step = 'active') as active_patients,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subs,
        (SELECT SUM(amount_cents) FROM subscriptions WHERE status = 'active') as total_revenue_cents,

        -- Mensagens de hoje em BRT
        (SELECT COUNT(*) FROM reminder_logs
          WHERE DATE(sent_at AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
            AND status = 'sent') as msgs_today,

        (SELECT COUNT(*) FROM reminder_logs
          WHERE DATE(sent_at AT TIME ZONE 'America/Sao_Paulo') = ${todayBRT}::date
        ) as total_reminders_today,

        -- Confirmações de hoje em BRT
        (SELECT COUNT(*) FROM medication_confirmations
          WHERE date = ${todayBRT}::date
            AND confirmation_status = 'confirmed') as confirmed_today,

        (SELECT COUNT(*) FROM medication_confirmations
          WHERE date = ${todayBRT}::date
        ) as total_confirmations_today,

        -- Crescimento: novos pacientes (30 dias)
        (SELECT COUNT(*) FROM patients
          WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') >= (${todayBRT}::date - INTERVAL '30 days')
        ) as new_patients_30d,

        -- Churn últimos 30 dias
        (SELECT COUNT(*) FROM subscriptions
          WHERE status = 'cancelled'
            AND DATE(cancelled_at AT TIME ZONE 'America/Sao_Paulo') >= (${todayBRT}::date - INTERVAL '30 days')
        ) as churned_30d,

        -- Onboarding em andamento (útil para monitorar)
        (SELECT COUNT(*) FROM patients
          WHERE is_active = true
            AND onboarding_step NOT IN ('active')
        ) as onboarding_pending
    `);

    const row = (kpisResult as any).rows?.[0] || kpisResult;
    const activePatients      = Number(row.active_patients)       || 0;
    const totalRevenueCents   = Number(row.total_revenue_cents)   || 0;
    const msgsToday           = Number(row.msgs_today)            || 0;
    const totalReminders      = Number(row.total_reminders_today) || 0;
    const confirmedToday      = Number(row.confirmed_today)       || 0;
    const totalConfirmations  = Number(row.total_confirmations_today) || 0;
    const newPatients30d      = Number(row.new_patients_30d)      || 0;
    const churned30d          = Number(row.churned_30d)           || 0;
    const onboardingPending   = Number(row.onboarding_pending)    || 0;

    const mrr          = Math.round(totalRevenueCents / 12 / 100);
    const arr          = Math.round(totalRevenueCents / 100);
    const deliveryRate = totalReminders > 0 ? Math.round((msgsToday / totalReminders) * 1000) / 10 : 0;
    const confirmRate  = totalConfirmations > 0 ? Math.round((confirmedToday / totalConfirmations) * 1000) / 10 : 0;
    const churnRate    = activePatients > 0 ? Math.round((churned30d / activePatients) * 1000) / 10 : 0;

    res.json({
      activePatients,
      mrr,
      arr,
      msgsToday,
      deliveryRate,
      confirmRate,
      churnRate,
      newPatients30d,
      onboardingPending,
      ticketMedio: 149,
      _tz: 'America/Sao_Paulo', // indicador para o frontend de que métricas estão em BRT
    });
  } catch (error: any) {
    logger.error('Dashboard KPI error', { error: error.message });
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
});

/** Novos assinantes por dia (últimos 7 dias) — em BRT */
router.get('/admin/dashboard/new-subs', async (_req, res) => {
  try {
    const todayBRT = getTodayBRT();
    const result = await db.execute(sql`
      SELECT
        DATE(created_at AT TIME ZONE 'America/Sao_Paulo') as day,
        COUNT(*) as count
      FROM patients
      WHERE DATE(created_at AT TIME ZONE 'America/Sao_Paulo') >= (${todayBRT}::date - INTERVAL '7 days')
      GROUP BY DATE(created_at AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY day
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Receita mensal (últimos 6 meses) — em BRT */
router.get('/admin/dashboard/revenue', async (_req, res) => {
  try {
    const todayBRT = getTodayBRT();
    const result = await db.execute(sql`
      SELECT
        TO_CHAR(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') as month,
        SUM(amount_cents) as total_cents,
        COUNT(*) as count
      FROM subscriptions
      WHERE (starts_at AT TIME ZONE 'America/Sao_Paulo') >= (${todayBRT}::date - INTERVAL '6 months')
        AND status IN ('active', 'expired')
      GROUP BY TO_CHAR(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
      ORDER BY month
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
