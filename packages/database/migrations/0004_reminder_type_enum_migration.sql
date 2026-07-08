-- Migration 0004: Atualiza o enum reminder_type para o novo formato de lembretes
--
-- Contexto: O MVP revelou excesso de lembretes com a cadência anterior (T-30, T-5, T+5).
-- O novo formato reduz para 3 lembretes mais compactos: T-10 (aviso), T±0 (hora exata), T+10 (confirmação).
--
-- IMPORTANTE: PostgreSQL não permite remover valores de um enum existente.
-- Os valores antigos (t_minus_30, t_minus_5, t_plus_5) são mantidos para preservar
-- a integridade dos dados históricos em reminder_logs. Novos registros usarão apenas
-- os valores novos. Os antigos ficam como dead enum values — válidos no banco, nunca
-- mais inseridos pelo código.
--
-- SEGURANÇA DE DADOS: A tabela `medications` (nomes, dosagens, horários) usa text[]
-- e NÃO é afetada por esta migration. Zero risco de perda de dados dos pacientes.

-- Adicionar novos valores ao enum (operação segura — ADD VALUE é transacionalmente segura
-- a partir do PostgreSQL 12, mas requer que não haja uso em transação com DDL simultâneo).
ALTER TYPE reminder_type ADD VALUE IF NOT EXISTS 't_minus_10';
ALTER TYPE reminder_type ADD VALUE IF NOT EXISTS 't_zero';
ALTER TYPE reminder_type ADD VALUE IF NOT EXISTS 't_plus_10';

-- Verificação: consulta de sanidade para confirmar que os novos valores estão presentes
-- (pode ser executada manualmente após a migration para validar)
-- SELECT enumlabel FROM pg_enum
-- JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
-- WHERE pg_type.typname = 'reminder_type'
-- ORDER BY enumsortorder;
-- Resultado esperado: t_minus_30, t_minus_5, t_plus_5, t_minus_10, t_zero, t_plus_10
