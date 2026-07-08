/**
 * @module apply-0004-admin-users
 * @description Aplica migration 0004 + seed do admin inicial a partir de env vars.
 *
 * Uso:
 *   railway run --service lembrymed-api -- tsx packages/database/apply-0004-admin-users.ts
 */

import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ DATABASE_URL ausente');
    process.exit(1);
  }

  const sql = neon(url);
  const migrationPath = path.join(__dirname, 'migrations', '0004_admin_users.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  // Statement-by-statement (Neon HTTP não suporta multi-statement).
  // Remove linhas de comentário -- ANTES do split, para não filtrar
  // estatements inteiros por causa de um comentário no topo.
  const cleaned = migration
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleaned
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    const preview = stmt.substring(0, 70).replace(/\s+/g, ' ');
    console.log('▶', preview + (stmt.length > 70 ? '...' : ''));
    await sql(stmt);
  }

  // Seed
  const email = process.env.ADMIN_EMAIL;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const phone = process.env.ADMIN_WHATSAPP || '5574999774500';

  if (!email || !hash) {
    console.error('❌ ADMIN_EMAIL e ADMIN_PASSWORD_HASH são obrigatórios para seed');
    process.exit(1);
  }

  const existing = (await sql(
    `SELECT id FROM admin_users WHERE LOWER(email) = LOWER($1)`,
    [email],
  )) as any[];

  if (existing.length === 0) {
    await sql(
      `INSERT INTO admin_users (email, password_hash, recovery_phone) VALUES ($1, $2, $3)`,
      [email, hash, phone],
    );
    console.log(`✓ Admin criado: ${email} (recovery: ${phone})`);
  } else {
    await sql(
      `UPDATE admin_users SET password_hash = $1, recovery_phone = $2, updated_at = NOW() WHERE id = $3`,
      [hash, phone, existing[0].id],
    );
    console.log(`✓ Admin atualizado: ${email} (recovery: ${phone})`);
  }

  // Validar
  const check = (await sql(
    `SELECT email, recovery_phone, substr(password_hash, 1, 10) as hp FROM admin_users`,
  )) as any[];
  console.log('─── Estado final ───');
  console.log(JSON.stringify(check, null, 2));
}

main().catch((err) => {
  console.error('✗ Erro fatal:', err.message);
  process.exit(1);
});
