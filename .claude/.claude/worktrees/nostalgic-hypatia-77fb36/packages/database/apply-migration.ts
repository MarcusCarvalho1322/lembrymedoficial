/**
 * @module apply-migration
 * @description Aplica um arquivo SQL de migração contra DATABASE_URL_UNPOOLED.
 *
 * Uso: DATABASE_URL_UNPOOLED="..." npx tsx apply-migration.ts migrations/NNNN.sql
 *
 * Estratégia: Neon HTTP é single-statement. Splita o arquivo em statements
 * (remove BEGIN/COMMIT/comments), roda cada um via template tag do neon().
 * Idempotente graças ao DROP/CREATE ... IF (NOT) EXISTS.
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Uso: tsx apply-migration.ts <arquivo.sql>');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('DATABASE_URL_UNPOOLED ausente');
    process.exit(1);
  }

  const raw = readFileSync(resolve(file), 'utf-8');
  console.log(`Aplicando ${file} em ${url.split('@')[1]?.split('/')[0] || 'banco'}`);

  const sql = neon(url);

  // Remove:
  //   - linhas de comentário (-- ...)
  //   - BEGIN; / COMMIT; (Neon HTTP não suporta transação multi-statement)
  const stripped = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  // Splita em statements. Usa regex que quebra em `;` no final de linha ou
  // seguido apenas por whitespace.
  const statements = stripped
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => !/^(BEGIN|COMMIT|ROLLBACK)$/i.test(s));

  console.log(`${statements.length} statements detectados`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    try {
      await (sql as any)(stmt + ';');
      ok++;
      console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}${stmt.length > 80 ? '...' : ''}`);
    } catch (err: any) {
      // Idempotência: alguns fails são aceitáveis (ex: DROP CONSTRAINT IF EXISTS
      // retornando warning ao invés de erro em algumas versões). Mas se for
      // erro real, abortamos.
      const msg = err.message || String(err);
      if (
        msg.includes('does not exist') && stmt.toUpperCase().includes('DROP CONSTRAINT IF EXISTS')
      ) {
        skipped++;
        console.log(`  ⊘ [${i + 1}/${statements.length}] ${preview} (já removido)`);
      } else {
        failed++;
        console.error(`  ✗ [${i + 1}/${statements.length}] ${preview}`);
        console.error(`    → ${msg}`);
      }
    }
  }

  console.log(`\nResumo: ${ok} OK, ${skipped} pulados, ${failed} falhas.`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`✗ Erro fatal: ${err.message}`);
  process.exit(1);
});
