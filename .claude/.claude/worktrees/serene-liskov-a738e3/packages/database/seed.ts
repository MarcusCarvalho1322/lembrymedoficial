/**
 * @module Seed — Configurações iniciais
 * @description Popula system_config e gera hash de admin.
 * Uso: npx tsx packages/database/seed.ts
 */

import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);

  console.log('═══ LEMBRYMED — Seed ═══\n');

  // 1. System config
  console.log('1. Inserindo configurações do sistema...');
  await sql`
    INSERT INTO system_config (key, value, description) VALUES
      ('reminder_offsets', '{"t_minus_30": 30, "t_minus_5": 5, "t_plus_5": 5}', 'Offsets de lembretes em minutos'),
      ('family_alert_delay', '30', 'Minutos antes de alertar familiar'),
      ('renewal_days', '[30, 15, 3]', 'Dias antes do vencimento para lembrete'),
      ('annual_price_cents', '14900', 'Preço anual em centavos (R$ 149,00)'),
      ('ai_model_extraction', '"claude-haiku-4-5-20251001"', 'Modelo para extração de medicamentos'),
      ('ai_model_onboarding', '"claude-sonnet-4-6"', 'Modelo para onboarding agent'),
      ('whatsapp_daily_limit', '1000', 'Limite diário de mensagens WhatsApp')
    ON CONFLICT (key) DO NOTHING
  `;
  console.log('   ✅ Configurações inseridas\n');

  // 2. Gerar hash de senha admin
  const adminPassword = process.env.ADMIN_PASSWORD || 'lembrymed-admin-2026';
  const hash = await bcrypt.hash(adminPassword, 12);
  console.log('2. Hash de senha admin gerado:');
  console.log(`   ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`   (senha: ${adminPassword})\n`);

  console.log('═══ Seed concluído ═══');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
