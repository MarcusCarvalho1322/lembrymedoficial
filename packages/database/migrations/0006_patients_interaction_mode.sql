-- Migration 0006: Adiciona coluna `interaction_mode` em `patients`.
--
-- Contexto: até agora `agent_session_id` tinha uso dual — ID de sessão
-- legacy (Managed Agents) E flag de modo de interação ('med_update_mode',
-- 'family_update_mode'). Esse acoplamento foi documentado como risco em
-- AUDIT/RISCOS-RESIDUAIS.md e identificado novamente na auditoria 2026-05-12.
--
-- Esta migration adiciona `interaction_mode` como coluna dedicada com valores
-- 'med_update' | 'family_update' | NULL. O código (Onda 3.18) passa a usar
-- esta coluna para o estado de modo, deixando `agent_session_id` livre para
-- uso futuro original (session id).
--
-- BACKFILL: registros existentes onde agent_session_id é uma das flags são
-- migrados para interaction_mode e o agent_session_id é zerado.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS interaction_mode VARCHAR(32);

-- Backfill 1-time. Idempotente — só atualiza onde agent_session_id ainda
-- guarda uma das flags. Mapeamos para o novo nome curto (sem _mode).
UPDATE patients
   SET interaction_mode = 'med_update',
       agent_session_id = NULL
 WHERE agent_session_id = 'med_update_mode';

UPDATE patients
   SET interaction_mode = 'family_update',
       agent_session_id = NULL
 WHERE agent_session_id = 'family_update_mode';
