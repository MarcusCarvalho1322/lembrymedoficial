-- Migration: 0003_drop_legacy_prisma_fks
-- Descrição: remove as foreign keys estilo Prisma (`*_fkey`) que ainda
--            existem paralelamente às FKs Drizzle (`*_xxx_id_fk`) com CASCADE.
-- Motivo: a verificação de schema em 22/04/2026 mostrou que as tabelas
--         dependentes (reminder_logs, medication_confirmations, message_logs,
--         family_alert_logs) têm FK duplicada. A versão Prisma com NO ACTION
--         ainda bloqueia DELETE /admin/patients/:id. Removemos as legadas.
--
-- Verificação antes:
--   SELECT tc.table_name, tc.constraint_name, rc.delete_rule
--   FROM information_schema.table_constraints tc
--   JOIN information_schema.referential_constraints rc USING (constraint_name)
--   WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';

-- reminder_logs: 2 FKs antigas
ALTER TABLE reminder_logs DROP CONSTRAINT IF EXISTS reminder_logs_patient_id_fkey;
ALTER TABLE reminder_logs DROP CONSTRAINT IF EXISTS reminder_logs_medication_id_fkey;

-- medication_confirmations: 3 FKs antigas
ALTER TABLE medication_confirmations DROP CONSTRAINT IF EXISTS medication_confirmations_patient_id_fkey;
ALTER TABLE medication_confirmations DROP CONSTRAINT IF EXISTS medication_confirmations_medication_id_fkey;
ALTER TABLE medication_confirmations DROP CONSTRAINT IF EXISTS medication_confirmations_reminder_log_id_fkey;

-- message_logs: 1 FK antiga (estado atual: NO ACTION mas sem CASCADE duplicada!)
-- Este é mais sensível — vamos DROPar e recriar com SET NULL
ALTER TABLE message_logs DROP CONSTRAINT IF EXISTS message_logs_patient_id_fkey;
ALTER TABLE message_logs DROP CONSTRAINT IF EXISTS message_logs_patient_id_patients_id_fk;
ALTER TABLE message_logs
  ADD CONSTRAINT message_logs_patient_id_patients_id_fk
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

-- family_alert_logs: 3 FKs antigas (duplicadas)
ALTER TABLE family_alert_logs DROP CONSTRAINT IF EXISTS family_alert_logs_patient_id_fkey;
ALTER TABLE family_alert_logs DROP CONSTRAINT IF EXISTS family_alert_logs_family_contact_id_fkey;
ALTER TABLE family_alert_logs DROP CONSTRAINT IF EXISTS family_alert_logs_medication_id_fkey;

-- Para family_alert_logs.patient_id precisa garantir CASCADE (não existe na versão nova)
ALTER TABLE family_alert_logs DROP CONSTRAINT IF EXISTS family_alert_logs_patient_id_patients_id_fk;
ALTER TABLE family_alert_logs
  ADD CONSTRAINT family_alert_logs_patient_id_patients_id_fk
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
