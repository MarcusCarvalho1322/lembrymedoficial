-- Migration: 0001_onboarding_nudge_count
-- Descrição: Adiciona coluna para rastrear quantos nudges de reengajamento
--            foram enviados a cada paciente durante o onboarding.
-- Usado por: workers/onboarding-nudge.worker.ts
-- Data: 2025

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS onboarding_nudge_count INTEGER DEFAULT 0;

-- Comentário para documentação
COMMENT ON COLUMN patients.onboarding_nudge_count IS
  'Número de mensagens de reengajamento (nudges) enviadas durante o onboarding parado. '
  'Máximo de 2 nudges por etapa antes de logar como abandono.';
