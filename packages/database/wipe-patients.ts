/**
 * @module wipe-patients
 * @description Apaga TODOS os dados de pacientes do PostgreSQL para testar do zero.
 *
 * O que é apagado (via CASCADE):
 *   - patients, medications, reminder_logs, medication_confirmations,
 *     family_contacts, family_alert_logs, subscriptions, consent_logs
 *   - admin_audit_logs (log de quem administrou)
 *   - message_logs (SET NULL em patient_id — preserva o log, zera o link)
 *
 * O que NÃO é apagado:
 *   - system_config, privacy_policies
 *
 * Uso:
 *   DATABASE_URL="..." npx tsx wipe-patients.ts --dry-run
 *   DATABASE_URL="..." npx tsx wipe-patients.ts --yes
 */

import { Pool } from 'pg';

const TABLES_IN_ORDER = [
  'family_alert_logs',
  'medication_confirmations',
  'reminder_logs',
  'family_contacts',
  'medications',
  'consent_logs',
  'admin_audit_logs',
  'subscriptions',
  'message_logs',
  'patients',
];

async function count(pool: Pool, table: string): Promise<number> {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return r.rows[0]?.n ?? 0;
  } catch {
    return -1;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL ausente');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--yes');

  if (!dryRun && !confirmed) {
    console.error('Use --dry-run para ver o inventário, ou --yes para apagar de verdade.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  console.log(`\nBanco: ${url.split('@')[1]?.split('/')[0] || '?'}`);
  console.log(`Modo:  ${dryRun ? 'DRY RUN (sem apagar)' : 'EXECUTAR (APAGAR DE VERDADE)'}`);
  console.log('');

  // Inventário antes
  console.log('─── Contagem ANTES ───');
  const before: Record<string, number> = {};
  for (const t of TABLES_IN_ORDER) {
    before[t] = await count(pool, t);
    console.log(`  ${t.padEnd(26)} ${before[t].toString().padStart(6)} registros`);
  }

  if (dryRun) {
    console.log('\n(dry run, nada apagado)');
    await pool.end();
    return;
  }

  console.log('\n─── Executando DELETEs em ordem ───');
  for (const t of TABLES_IN_ORDER) {
    if (before[t] <= 0) continue;
    try {
      await pool.query(`DELETE FROM ${t}`);
      console.log(`  ✓ ${t.padEnd(26)} — apagado (${before[t]} linhas)`);
    } catch (err: any) {
      console.error(`  ✗ ${t.padEnd(26)} — erro: ${err.message}`);
    }
  }

  // Inventário depois
  console.log('\n─── Contagem DEPOIS ───');
  let allZero = true;
  for (const t of TABLES_IN_ORDER) {
    const n = await count(pool, t);
    const ok = n === 0;
    if (!ok) allZero = false;
    console.log(`  ${ok ? '✓' : '⚠'} ${t.padEnd(26)} ${n.toString().padStart(6)} registros`);
  }

  console.log('');
  if (allZero) {
    console.log('✅ Banco zerado. Pronto pra testar do zero.');
  } else {
    console.log('⚠️  Algumas tabelas ainda têm registros. Verifique acima.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('✗ Erro fatal:', err.message);
  process.exit(1);
});
