/**
 * @module apply-migration
 * @description Aplica um arquivo SQL de migração contra DATABASE_URL.
 *
 * Uso: DATABASE_URL="..." npx tsx apply-migration.ts migrations/NNNN.sql
 *
 * Com pg (node-postgres) o arquivo inteiro roda como multi-statement nativo —
 * não precisa mais do split statement-a-statement do driver Neon HTTP.
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: tsx apply-migration.ts <arquivo.sql>');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL ausente');
    process.exit(1);
  }

  const raw = readFileSync(resolve(file), 'utf-8');
  const host = url.split('@')[1]?.split('/')[0] || 'banco';
  console.log(`Aplicando ${file} em ${host}`);

  const pool = new Pool({ connectionString: url });

  try {
    await pool.query(raw);
    console.log(`✓ Migration aplicada com sucesso`);
  } catch (err: any) {
    console.error(`✗ Erro ao aplicar migration:`);
    console.error(`  ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`✗ Erro fatal: ${err.message}`);
  process.exit(1);
});
