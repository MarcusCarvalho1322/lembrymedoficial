/**
 * @module wipe-redis
 * @description Limpa jobs BullMQ + sessões de onboarding do Redis para
 *              testar do zero após o wipe de pacientes. Usa ioredis
 *              (já instalado em apps/api).
 */

import Redis from 'ioredis';

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error('REDIS_URL ausente');
    process.exit(1);
  }

  const confirmed = process.argv.includes('--yes');
  if (!confirmed) {
    console.error('Use --yes para executar.');
    process.exit(1);
  }

  const r = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });

  const patterns = [
    'bull:reminders:*',
    'bull:reminder-sender:*',
    'bull:*', // cobertura ampla
    'onboarding:*',
    'onboarding-nudge:*',
    'rate-limit:*',
    'dedup:*',
    'zapi:*',
  ];

  console.log(`\nRedis: ${url.split('@')[1]?.split(':')[0] || '?'}\n`);

  let totalDeleted = 0;
  for (const pat of patterns) {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, found] = await r.scan(cursor, 'MATCH', pat, 'COUNT', 200);
      cursor = next;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) {
      // Delete em lotes de 500 para evitar comando gigante
      for (let i = 0; i < keys.length; i += 500) {
        const batch = keys.slice(i, i + 500);
        await r.del(...batch);
      }
      totalDeleted += keys.length;
      console.log(`  ✓ ${pat.padEnd(30)} — ${keys.length} chaves apagadas`);
    } else {
      console.log(`  · ${pat.padEnd(30)} — nenhuma chave`);
    }
  }

  await r.quit();
  console.log(`\n✅ Redis limpo. Total: ${totalDeleted} chaves.`);
}

main().catch((err) => {
  console.error('✗ Erro fatal:', err.message);
  process.exit(1);
});
