-- Migration 0004 — Tabela admin_users
--
-- Motivo: mover credenciais admin de env var (Railway) para o banco,
-- permitindo auto-atendimento de recuperação de senha via WhatsApp.
-- A env var ADMIN_PASSWORD_HASH continua existindo como fallback
-- para bootstrap inicial (primeira subida antes da migration rodar).

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_phone VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_email ON admin_users (LOWER(email));
