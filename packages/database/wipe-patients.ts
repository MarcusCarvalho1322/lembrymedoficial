/**
 * @module wipe-patients
 * @description Apaga TODOS os dados de pacientes do Neon para testar do zero.
 *
 * O que é apagado (via CASCADE):
 *   - patients
 *   - medications (CASCADE via patient_id)
 *   - reminder_logs (CASCADE via patient_id + medication_id)
 *   - medication_confirmations (CASCADE)
 *   - family_contacts (CASCADE)
 *   - family_alert_logs (CASCADE)
 *   - subscriptions (se tiver FK para patient_id)
 *   - consent_logs (CASCADE)
 *   - admin_audit_logs (limpado separadamente — é log de quem administrou)
 *   - message_logs (SET NULL em patient_id — preservamos o log, zerando o link)
 *
 * O que NÃO é apagado:
 *   - system_config
 *   - privacy_policies
 *   - tabelas Prisma legacy (Patient, Medication, etc. capitalized — já órfãs)
 *
 * Uso:
 *   DATABASE_URL_UNPOOLED="..." npx tsx wipe-patients.ts --dry-run
 *   DATABASE_URL_UNPOOLED="..." npx tsx wipe-patients.ts --yes
 */

import { neon } from '@neondatabase/serverless';

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

async function count(sql: any, table: string): Promise<number> {
  try {
    const r = (await sql(`SELECT COUNT(*)::int AS n FROM ${table}`)) as any[];
    return r[0]?.n ?? 0;
  } catch {
    return -1;
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('DATABASE_URL_UNPOOLED ausente');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--yes');

  if (!dryRun && !confirmed) {
    console.error('Use --dry-run para ver o inventário, ou --yes para apagar de verdade.');
    process.exit(1);
  }

  const sql = neon(url);

  console.log(`\nBanco: ${url.split('@')[1]?.split('/')[0] || '?'}`);
  console.log(`Modo:  ${dryRun ? 'DRY RUN (sem apagar)' : 'EXECUTAR (APAGAR DE VERDADE)'}`);
  console.log('');

  // Inventário antes
  console.log('─── Contagem ANTES ───');
  const before: Record<string, number> = {};
  for (const t of TABLES_IN_ORDER) {
    before[t] = await count(sql, t);
    console.log(`  ${t.padEnd(26)} ${before[t].toString().padStart(6)} registros`);
  }

  if (dryRun) {
    console.log('\n(dry run, nada apagado)');
    return;
  }

  console.log('\n─── Executando DELETEs em ordem ───');
  // Ordem importa para evitar conflito de FK apesar do CASCADE (mais explícito):
  // apagar dependentes antes dos pais.
  for (const t of TABLES_IN_ORDER) {
    if (before[t] <= 0) continue;
    try {
      const r = (await sql(`DELETE FROM ${t}`)) as any;
      console.log(`  ✓ ${t.padEnd(26)} — apagado (${before[t]} linhas)`);
    } catch (err: any) {
      console.error(`  ✗ ${t.padEnd(26)} — erro: ${err.message}`);
    }
  }

  // Inventário depois
  console.log('\n─── Contagem DEPOIS ───');
  let allZero = true;
  for (const t of TABLES_IN_ORDER) {
    const n = await count(sql, t);
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
}

main().catch((err) => {
  console.error('✗ Erro fatal:', err.message);
  process.exit(1);
});
