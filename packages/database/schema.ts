/**
 * @module Schema do banco de dados Lembrymed v2
 * @description Schema Drizzle ORM para Neon PostgreSQL.
 * Inclui campo agent_session_id para integração com Managed Agents.
 */

import {
  pgTable, uuid, varchar, text, boolean, integer, timestamp,
  pgEnum, jsonb, date, time, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ═══ ENUMS ═══

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active', 'expired', 'cancelled', 'suspended',
]);

export const reminderTypeEnum = pgEnum('reminder_type', [
  // Valores legados — mantidos para integridade dos dados históricos em reminder_logs.
  // O código não mais insere esses valores; existem apenas como dead enum values no DB.
  't_minus_30', 't_minus_5', 't_plus_5',
  // Valores ativos — formato MVP v2 (migration 0004)
  't_minus_10', 't_zero', 't_plus_10',
]);

export const reminderStatusEnum = pgEnum('reminder_status', [
  'scheduled', 'sent', 'delivered', 'failed',
]);

export const confirmationStatusEnum = pgEnum('confirmation_status', [
  'confirmed', 'denied', 'no_response',
]);

export const messageDirectionEnum = pgEnum('message_direction', [
  'inbound', 'outbound',
]);

export const onboardingStepEnum = pgEnum('onboarding_step', [
  'welcome_sent', 'family_asked', 'family_registered',
  'medications_requested', 'medications_received',
  'medications_confirmed', 'active',
]);

// ═══ PACIENTES ═══

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  whatsappId: varchar('whatsapp_id', { length: 50 }),
  onboardingStep: onboardingStepEnum('onboarding_step').default('welcome_sent'),
  agentSessionId: varchar('agent_session_id', { length: 255 }),
  onboardingNudgeCount: integer('onboarding_nudge_count').default(0),
  timezone: varchar('timezone', { length: 50 }).default('America/Sao_Paulo'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPhone: index('idx_patients_phone').on(table.phone),
  idxSession: index('idx_patients_session').on(table.agentSessionId),
}));

// ═══ FAMILIARES ═══

export const familyContacts = pgTable('family_contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  whatsappId: varchar('whatsapp_id', { length: 50 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPatient: index('idx_family_patient').on(table.patientId),
}));

// ═══ ASSINATURAS ═══

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  stripePaymentIntentId: varchar('stripe_payment_intent_id', { length: 255 }),
  plan: varchar('plan', { length: 50 }).default('annual'),
  /** Nível comercial: SILVER (Prata) | GOLD (Ouro). Define direito ao alerta familiar. */
  planTier: text('plan_tier').default('SILVER'),
  amountCents: integer('amount_cents').notNull(),
  status: subscriptionStatusEnum('status').default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  renewedAt: timestamp('renewed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  renewalReminder30dSent: boolean('renewal_reminder_30d_sent').default(false),
  renewalReminder15dSent: boolean('renewal_reminder_15d_sent').default(false),
  renewalReminder3dSent: boolean('renewal_reminder_3d_sent').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPatient: index('idx_subs_patient').on(table.patientId),
  idxStatus: index('idx_subs_status').on(table.status),
  idxExpires: index('idx_subs_expires').on(table.expiresAt),
  idxStripe: index('idx_subs_stripe').on(table.stripeCustomerId),
}));

// ═══ MEDICAMENTOS ═══

export const medications = pgTable('medications', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  dosage: varchar('dosage', { length: 100 }).notNull(),
  times: text('times').array().notNull(),
  instructions: text('instructions'),
  isActive: boolean('is_active').default(true),
  rawInput: text('raw_input'),
  aiExtractionJson: jsonb('ai_extraction_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPatient: index('idx_meds_patient').on(table.patientId),
}));

// ═══ LOG DE LEMBRETES ═══

export const reminderLogs = pgTable('reminder_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  reminderType: reminderTypeEnum('reminder_type').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  medicationTime: time('medication_time').notNull(),
  status: reminderStatusEnum('status').default('scheduled'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxScheduled: index('idx_reminders_scheduled').on(table.scheduledFor, table.status),
  idxPatient: index('idx_reminders_patient').on(table.patientId, table.scheduledFor),
}));

// ═══ CONFIRMAÇÕES ═══

export const medicationConfirmations = pgTable('medication_confirmations', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  reminderLogId: uuid('reminder_log_id').references(() => reminderLogs.id, { onDelete: 'set null' }),
  confirmationStatus: confirmationStatusEnum('confirmation_status').notNull(),
  medicationTime: time('medication_time').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  responseText: varchar('response_text', { length: 50 }),
  familyAlerted: boolean('family_alerted').default(false),
  familyAlertSentAt: timestamp('family_alert_sent_at', { withTimezone: true }),
  date: date('date').notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPatientDate: index('idx_conf_patient_date').on(table.patientId, table.date),
  uniqConf: uniqueIndex('idx_conf_unique').on(
    table.patientId, table.medicationId, table.medicationTime, table.date,
  ),
}));

// ═══ LOG DE MENSAGENS ═══

export const messageLogs = pgTable('message_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  direction: messageDirectionEnum('direction').notNull(),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }),
  phone: varchar('phone', { length: 20 }).notNull(),
  content: text('content'),
  mediaType: varchar('media_type', { length: 50 }),
  mediaUrl: text('media_url'),
  templateName: varchar('template_name', { length: 100 }),
  status: varchar('status', { length: 50 }),
  errorCode: varchar('error_code', { length: 50 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxPatient: index('idx_msgs_patient').on(table.patientId, table.createdAt),
  idxPhone: index('idx_msgs_phone').on(table.phone, table.createdAt),
}));

// ═══ LOG DE ALERTAS FAMILIARES ═══

export const familyAlertLogs = pgTable('family_alert_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  familyContactId: uuid('family_contact_id').notNull().references(() => familyContacts.id, { onDelete: 'cascade' }),
  medicationId: uuid('medication_id').notNull().references(() => medications.id, { onDelete: 'cascade' }),
  medicationTime: time('medication_time').notNull(),
  date: date('date').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Índice para a query de deduplicação diária em family-alerter.worker.ts
  idxDedup: index('idx_family_alerts_dedup').on(
    table.patientId, table.familyContactId, table.date, table.status,
  ),
}));

// ═══ CONFIGURAÇÕES ═══

export const systemConfig = pgTable('system_config', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ═══ LGPD — REGISTRO DE INCIDENTES (Art. 48) ═══
//
// LGPD Art. 48 exige que o controlador comunique à ANPD e ao titular
// a ocorrência de incidente de segurança que possa acarretar risco ou
// dano relevante. Esta tabela registra cada incidente LGPD para
// auditoria e notificação automática.
export const lgpdIncidents = pgTable('lgpd_incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  /** Tipo: \"deletion_request\", \"export_request\", \"data_breach\", \"consent_revoked\" */
  incidentType: varchar('incident_type', { length: 50 }).notNull(),
  /** Status: \"pending\", \"notified_anpd\", \"resolved\", \"closed\" */
  status: varchar('status', { length: 30 }).default('pending').notNull(),
  /** Canal de origem: \"whatsapp\", \"email\", \"web\", \"admin\" */
  source: varchar('source', { length: 30 }).notNull(),
  /** Prazo legal máximo (15 dias úteis para exclusão, Art. 19) */
  legalDeadline: timestamp('legal_deadline', { withTimezone: true }),
  /** Resumo do incidente para auditoria */
  summary: text('summary'),
  /** Admin responsável pela resolução */
  resolvedBy: varchar('resolved_by', { length: 255 }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  /** Se true, titular foi notificado (Art. 48 §1º) */
  titularNotified: boolean('titular_notified').default(false),
  /** Se true, ANPD foi notificada (Art. 48 caput) */
  anpdNotified: boolean('anpd_notified').default(false),
  ipAddress: varchar('ip_address', { length: 45 }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  idxIncidentPatient: index('idx_incident_patient').on(table.patientId, table.createdAt),
  idxIncidentType: index('idx_incident_type').on(table.incidentType, table.status),
  idxIncidentStatus: index('idx_incident_status').on(table.status, table.legalDeadline),
}));

// ═══ LGPD — REGISTRO DE CONSENTIMENTO ═══
//
// Art. 8º LGPD: consentimento deve ser "fornecido por escrito ou por outro
// meio que demonstre a manifestação de vontade do titular". Esta tabela
// registra cada aceite para fins de auditoria/ação judicial.
export const consentLogs = pgTable('consent_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }),
  /** Telefone — guardado mesmo após o paciente ser deletado (cópia snapshot) */
  phone: varchar('phone', { length: 20 }).notNull(),
  /** Versão dos termos aceitos — ex: "v1.0-2026-04-22" */
  policyVersion: varchar('policy_version', { length: 50 }).notNull(),
  /** Tipo de consentimento: "privacy", "terms", "whatsapp_opt_in" */
  consentType: varchar('consent_type', { length: 50 }).notNull(),
  /** Canal onde o consentimento foi capturado: "checkout", "whatsapp", "web" */
  source: varchar('source', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxPatient: index('idx_consent_patient').on(table.patientId),
  idxPhone: index('idx_consent_phone').on(table.phone),
}));

// ═══ LGPD — VERSÕES DAS POLÍTICAS DE PRIVACIDADE ═══
export const privacyPolicies = pgTable('privacy_policies', {
  version: varchar('version', { length: 50 }).primaryKey(),
  /** URL ou path da política publicada (markdown/html) */
  documentUrl: text('document_url').notNull(),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ═══ AUDITORIA — ACESSO ADMIN A DADOS DE PACIENTE ═══
//
// LGPD Art. 46 exige medidas técnicas de proteção de dado sensível. Esta
// tabela registra cada leitura/edição feita pelo admin para rastreabilidade.
export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Identificação do admin que fez a ação (email do JWT) */
  adminEmail: varchar('admin_email', { length: 255 }).notNull(),
  /** Ação: "view_patient", "edit_patient", "delete_patient", "export_patient", "login" */
  action: varchar('action', { length: 50 }).notNull(),
  /** Paciente afetado (pode ser null se ação for "login" ou sem paciente específico) */
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  /** Detalhes estruturados da ação (ex: campos alterados em edit) */
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idxAdminCreated: index('idx_audit_admin_created').on(table.adminEmail, table.createdAt),
  idxPatient: index('idx_audit_patient').on(table.patientId, table.createdAt),
  idxAction: index('idx_audit_action').on(table.action, table.createdAt),
}));

// ═══ RELATIONS ═══

export const patientsRelations = relations(patients, ({ many }) => ({
  familyContacts: many(familyContacts),
  subscriptions: many(subscriptions),
  medications: many(medications),
  reminderLogs: many(reminderLogs),
  confirmations: many(medicationConfirmations),
  messageLogs: many(messageLogs),
}));

export const familyContactsRelations = relations(familyContacts, ({ one }) => ({
  patient: one(patients, { fields: [familyContacts.patientId], references: [patients.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  patient: one(patients, { fields: [subscriptions.patientId], references: [patients.id] }),
}));

export const medicationsRelations = relations(medications, ({ one }) => ({
  patient: one(patients, { fields: [medications.patientId], references: [patients.id] }),
}));

export const reminderLogsRelations = relations(reminderLogs, ({ one }) => ({
  patient: one(patients, { fields: [reminderLogs.patientId], references: [patients.id] }),
  medication: one(medications, { fields: [reminderLogs.medicationId], references: [medications.id] }),
}));

export const confirmationsRelations = relations(medicationConfirmations, ({ one }) => ({
  patient: one(patients, { fields: [medicationConfirmations.patientId], references: [patients.id] }),
  medication: one(medications, { fields: [medicationConfirmations.medicationId], references: [medications.id] }),
  reminderLog: one(reminderLogs, { fields: [medicationConfirmations.reminderLogId], references: [reminderLogs.id] }),
}));

export const consentLogsRelations = relations(consentLogs, ({ one }) => ({
  patient: one(patients, { fields: [consentLogs.patientId], references: [patients.id] }),
}));

export const adminAuditLogsRelations = relations(adminAuditLogs, ({ one }) => ({
  patient: one(patients, { fields: [adminAuditLogs.patientId], references: [patients.id] }),
}));
