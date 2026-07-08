-- Migration: 0002_cascade_and_lgpd_tables
-- Descrição: Onda 3 da auditoria forense (2026-04-22).
--   1. Adiciona ON DELETE CASCADE/SET NULL nas FKs órfãs para permitir
--      o direito LGPD à exclusão (`DELETE /admin/patients/:id`).
--   2. Adiciona tabelas LGPD: consent_logs, privacy_policies, admin_audit_logs.
--   3. Cria índice de dedup diária em family_alert_logs.
--
-- ⚠️ Testar em Neon BRANCH de preview antes de aplicar em produção.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. FKs com CASCADE
-- ══════════════════════════════════════════════════════════════════════════

-- reminder_logs
ALTER TABLE reminder_logs
  DROP CONSTRAINT IF EXISTS reminder_logs_patient_id_patients_id_fk,
  ADD CONSTRAINT reminder_logs_patient_id_patients_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE reminder_logs
  DROP CONSTRAINT IF EXISTS reminder_logs_medication_id_medications_id_fk,
  ADD CONSTRAINT reminder_logs_medication_id_medications_id_fk
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE;

-- medication_confirmations
ALTER TABLE medication_confirmations
  DROP CONSTRAINT IF EXISTS medication_confirmations_patient_id_patients_id_fk,
  ADD CONSTRAINT medication_confirmations_patient_id_patients_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE medication_confirmations
  DROP CONSTRAINT IF EXISTS medication_confirmations_medication_id_medications_id_fk,
  ADD CONSTRAINT medication_confirmations_medication_id_medications_id_fk
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE;

ALTER TABLE medication_confirmations
  DROP CONSTRAINT IF EXISTS medication_confirmations_reminder_log_id_reminder_logs_id_fk,
  ADD CONSTRAINT medication_confirmations_reminder_log_id_reminder_logs_id_fk
    FOREIGN KEY (reminder_log_id) REFERENCES reminder_logs(id) ON DELETE SET NULL;

-- message_logs (SET NULL para preservar histórico anonimizado após delete do paciente)
ALTER TABLE message_logs
  DROP CONSTRAINT IF EXISTS message_logs_patient_id_patients_id_fk,
  ADD CONSTRAINT message_logs_patient_id_patients_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- family_alert_logs
ALTER TABLE family_alert_logs
  DROP CONSTRAINT IF EXISTS family_alert_logs_patient_id_patients_id_fk,
  ADD CONSTRAINT family_alert_logs_patient_id_patients_id_fk
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE family_alert_logs
  DROP CONSTRAINT IF EXISTS family_alert_logs_family_contact_id_family_contacts_id_fk,
  ADD CONSTRAINT family_alert_logs_family_contact_id_family_contacts_id_fk
    FOREIGN KEY (family_contact_id) REFERENCES family_contacts(id) ON DELETE CASCADE;

ALTER TABLE family_alert_logs
  DROP CONSTRAINT IF EXISTS family_alert_logs_medication_id_medications_id_fk,
  ADD CONSTRAINT family_alert_logs_medication_id_medications_id_fk
    FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE;

-- Índice de dedup para query quente de family-alerter.worker.ts
CREATE INDEX IF NOT EXISTS idx_family_alerts_dedup
  ON family_alert_logs (patient_id, family_contact_id, date, status);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Tabelas LGPD
-- ══════════════════════════════════════════════════════════════════════════

-- consent_logs: registro de cada aceite de termos
CREATE TABLE IF NOT EXISTS consent_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID REFERENCES patients(id) ON DELETE CASCADE,
  phone            VARCHAR(20) NOT NULL,
  policy_version   VARCHAR(50) NOT NULL,
  consent_type     VARCHAR(50) NOT NULL,
  source           VARCHAR(50) NOT NULL,
  ip_address       VARCHAR(45),
  user_agent       TEXT,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_patient ON consent_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_phone   ON consent_logs(phone);

-- privacy_policies: catálogo de versões da política
CREATE TABLE IF NOT EXISTS privacy_policies (
  version         VARCHAR(50) PRIMARY KEY,
  document_url    TEXT NOT NULL,
  effective_from  TIMESTAMPTZ NOT NULL,
  summary         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed da versão inicial (será substituída quando o texto oficial for
-- publicado em /privacidade na landing).
INSERT INTO privacy_policies (version, document_url, effective_from, summary) VALUES
  ('v1.0-2026-04-22',
   '/privacidade',
   '2026-04-22 00:00:00-03',
   'Política de Privacidade inicial do Lembrymed — base legal Art. 7 IX (consentimento) + Art. 11 II (a) (tutela da saúde por profissional de saúde) da LGPD.')
ON CONFLICT (version) DO NOTHING;

-- admin_audit_logs: rastreabilidade de ações admin
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email   VARCHAR(255) NOT NULL,
  action        VARCHAR(50) NOT NULL,
  patient_id    UUID REFERENCES patients(id) ON DELETE SET NULL,
  ip_address    VARCHAR(45),
  user_agent    TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_admin_created ON admin_audit_logs(admin_email, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_patient       ON admin_audit_logs(patient_id,  created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action        ON admin_audit_logs(action,       created_at);

COMMIT;
