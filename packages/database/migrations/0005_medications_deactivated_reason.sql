-- Migration 0005: Adiciona coluna `deactivated_reason` em `medications`.
--
-- Contexto: bug crítico identificado em auditoria 2026-05-12. A renovação de
-- assinatura (stripe.ts:handleRenewal) reativava cegamente TODOS os
-- medicamentos com is_active=false, incluindo aqueles desativados pelo paciente
-- via med_update. Risco clínico real: lembretes para doses descontinuadas.
--
-- Esta coluna permite distinguir:
--   'suspension'  → desativado por expiração de assinatura (deve reativar na renovação)
--   'med_update'  → substituído pelo paciente (NÃO deve reativar na renovação)
--   NULL          → ativo
--
-- Backfill: registros existentes com is_active=false ficam como NULL (motivo
-- desconhecido). A próxima renovação para esses pacientes ainda exibirá o bug
-- antigo — mas após esta migration, novos casos são tratados corretamente.

ALTER TABLE medications
  ADD COLUMN IF NOT EXISTS deactivated_reason VARCHAR(32);

-- Índice parcial para acelerar a query da renovação (apenas suspended).
CREATE INDEX IF NOT EXISTS idx_meds_deactivated_reason
  ON medications (patient_id, deactivated_reason)
  WHERE is_active = false;
