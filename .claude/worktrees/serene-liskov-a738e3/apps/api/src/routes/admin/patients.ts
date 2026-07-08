/**
 * @module Admin — Gestão de Pacientes
 * @description Lista, busca, detalha, edita, exporta e deleta pacientes.
 *
 * Hardening (Onda 3):
 *   - Zod validation no PATCH.
 *   - Audit log em todas as ações sensíveis (LGPD Art. 46).
 *   - Validações de telefone brasileiro no body.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db, patients, medications, medicationConfirmations, familyContacts,
         subscriptions, reminderLogs, eq, and, desc } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { auditAdminAccess } from '../../middleware/auditLog';

const router = Router();

/**
 * Valida telefone BR no formato E.164 sem "+":
 *   - Começa com 55 (Brasil)
 *   - 12 ou 13 dígitos totais (DDD 2 + número 8 ou 9)
 */
const brPhoneSchema = z
  .string()
  .regex(/^55\d{10,11}$/, 'Telefone inválido — use formato 55DDDXXXXXXXX (ex: 5511999999999)');

const PatchBodySchema = z.object({
  fullName:          z.string().trim().min(3).max(120).optional(),
  /** Fornecido pelo admin pode conter máscara; sanitizamos antes de validar. */
  phone:             z.string().optional(),
  email:             z.string().trim().email().optional().or(z.literal('')),
  isActive:          z.boolean().optional(),
  forceReonboarding: z.boolean().optional(),
  resetNudgeCount:   z.boolean().optional(),
});

/** Lista todos os pacientes ativos com resumo */
router.get(
  '/admin/patients',
  auditAdminAccess('view_patient_list'),
  async (req, res) => {
  try {
    const search = (req.query.search as string) || '';
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    let query = sql`
      SELECT
        p.id, p.full_name, p.phone, p.email, p.onboarding_step, p.is_active,
        p.created_at,
        (SELECT COUNT(*) FROM medications m WHERE m.patient_id = p.id AND m.is_active = true) as med_count,
        (SELECT COUNT(*) FROM medication_confirmations mc WHERE mc.patient_id = p.id AND mc.date = (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date AND mc.confirmation_status = 'confirmed') as confirmed_today,
        (SELECT COUNT(*) FROM medication_confirmations mc WHERE mc.patient_id = p.id AND mc.date = (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date AND mc.confirmation_status != 'confirmed') as missed_today,
        (SELECT MAX(rl.sent_at) FROM reminder_logs rl WHERE rl.patient_id = p.id) as last_activity
      FROM patients p
      WHERE 1=1
    `;

    if (search) {
      query = sql`${query} AND (p.full_name ILIKE ${'%' + search + '%'} OR p.phone LIKE ${'%' + search + '%'})`;
    }

    query = sql`${query} ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await db.execute(query);

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM patients
      ${search ? sql`WHERE full_name ILIKE ${'%' + search + '%'} OR phone LIKE ${'%' + search + '%'}` : sql``}
    `);

    res.json({
      patients: result.rows,
      total: Number((countResult.rows as any)[0]?.total) || 0,
      page,
      limit,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Detalhe de um paciente por telefone */
router.get(
  '/admin/patients/:phone',
  auditAdminAccess('view_patient', {
    patientId: () => undefined, // resolvido em runtime via phone, não via id direto
    metadata: (req) => ({ phone: req.params.phone }),
  }),
  async (req, res) => {
  try {
    const patient = await db.query.patients.findFirst({
      where: eq(patients.phone, req.params.phone),
      with: {
        familyContacts: true,
        subscriptions: { orderBy: desc(subscriptions.createdAt), limit: 1 },
        medications: { where: eq(medications.isActive, true) },
      },
    });

    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado' });

    // Histórico de confirmações dos últimos 7 dias
    const history = await db.execute(sql`
      SELECT
        mc.date, mc.medication_time, mc.confirmation_status, mc.confirmed_at,
        mc.family_alerted, m.name as med_name, m.dosage
      FROM medication_confirmations mc
      JOIN medications m ON m.id = mc.medication_id
      WHERE mc.patient_id = ${patient.id}::uuid
        AND mc.date >= (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '7 days'
      ORDER BY mc.date DESC, mc.medication_time
    `);

    res.json({ patient, history: history.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Editar dados de um paciente — nome, telefone, email, status ativo,
 * forçar re-onboarding ou resetar contador de nudges.
 *
 * Body aceita qualquer combinação dos campos abaixo (todos opcionais):
 *   { fullName, phone, email, isActive, forceReonboarding, resetNudgeCount }
 *
 * Validação Zod:
 *   - fullName 3-120 caracteres
 *   - phone formato 55DDDXXXXXXXX (opcionalmente com máscara — sanitizamos)
 *   - email válido ou string vazia (= remover)
 */
router.patch(
  '/admin/patients/:id',
  auditAdminAccess('edit_patient', {
    metadata: (req) => ({ fields: Object.keys(req.body || {}) }),
  }),
  async (req, res) => {
  try {
    const { id } = req.params;

    const parsed = PatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    const body = parsed.data;

    // Verificar se paciente existe
    const existing = await db.query.patients.findFirst({
      where: eq(patients.id, id),
    });
    if (!existing) return res.status(404).json({ error: 'Paciente não encontrado' });

    // Montar objeto de atualização apenas com campos enviados
    const updateData: Record<string, any> = { updatedAt: new Date() };

    if (body.fullName !== undefined) updateData.fullName = body.fullName.trim();
    if (body.phone !== undefined) {
      const digits = body.phone.replace(/\D/g, '');
      const phoneParse = brPhoneSchema.safeParse(digits);
      if (!phoneParse.success) {
        return res.status(400).json({ error: phoneParse.error.issues[0].message });
      }
      updateData.phone = digits;
    }
    if (body.email !== undefined) updateData.email = body.email.trim() || null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    if (body.forceReonboarding === true) {
      updateData.onboardingStep = 'welcome_sent';
      updateData.agentSessionId = null;
      updateData.onboardingNudgeCount = 0;
    }

    if (body.resetNudgeCount === true && body.forceReonboarding !== true) {
      updateData.onboardingNudgeCount = 0;
    }

    await db.update(patients)
      .set(updateData)
      .where(eq(patients.id, id));

    const updated = await db.query.patients.findFirst({
      where: eq(patients.id, id),
    });

    res.json({ success: true, patient: updated });
  } catch (error: any) {
    if (error.message?.includes('unique') || error.code === '23505') {
      return res.status(409).json({ error: 'Este telefone já está cadastrado para outro paciente' });
    }
    res.status(500).json({ error: error.message });
  }
});

/** Deletar paciente (LGPD — direito ao esquecimento) */
router.delete(
  '/admin/patients/:id',
  auditAdminAccess('delete_patient'),
  async (req, res) => {
  try {
    // Com CASCADE aplicado (migration 0002), o delete agora cai limpamente
    // em todas as tabelas dependentes. Ver schema.ts + migration.
    await db.delete(patients).where(eq(patients.id, req.params.id));
    res.json({ success: true, message: 'Paciente e todos os dados removidos (LGPD)' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** Exportar dados do paciente (LGPD — portabilidade) */
router.get(
  '/admin/patients/:id/export',
  auditAdminAccess('export_patient'),
  async (req, res) => {
  try {
    const patient = await db.query.patients.findFirst({
      where: eq(patients.id, req.params.id),
      with: {
        familyContacts: true,
        subscriptions: true,
        medications: true,
        confirmations: true,
      },
    });

    if (!patient) return res.status(404).json({ error: 'Não encontrado' });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=lembrymed-export-${patient.phone}.json`);
    res.json({
      exportDate: new Date().toISOString(),
      service: 'Lembrymed',
      patient: {
        name: patient.fullName,
        email: patient.email,
        phone: patient.phone,
        createdAt: patient.createdAt,
      },
      familyContacts: patient.familyContacts,
      subscriptions: patient.subscriptions,
      medications: patient.medications,
      confirmations: patient.confirmations,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
