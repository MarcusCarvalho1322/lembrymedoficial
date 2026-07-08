/**
 * Lista as tabelas existentes no Neon para entender o estado atual.
 */
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) { console.error('DATABASE_URL_UNPOOLED ausente'); process.exit(1); }

  const sql = neon(url);

  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log('\n=== TABELAS ===');
  for (const t of tables as any[]) console.log(`  ${t.tablename}`);

  const constraints = await sql`
    SELECT tc.table_name, tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc USING (constraint_name)
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN ('reminder_logs','medication_confirmations','message_logs','family_alert_logs')
    ORDER BY tc.table_name, tc.constraint_name
  `;
  console.log('\n=== FKs em tabelas dependentes ===');
  for (const c of constraints as any[])
    console.log(`  ${c.table_name}.${c.constraint_name} → ${c.delete_rule}`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
