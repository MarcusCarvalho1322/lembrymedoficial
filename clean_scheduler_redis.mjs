import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');

const envContent = fs.readFileSync('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\.env', 'utf8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const idx = t.indexOf('=');
  if (idx < 0) continue;
  process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
}

const IORedis = require('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\apps\\api\\node_modules\\ioredis');
const redis = new IORedis.default(process.env.REDIS_PUBLIC_URL, { enableReadyCheck: false, maxRetriesPerRequest: 1, connectTimeout: 5000 });
await new Promise(r => setTimeout(r, 1000));

// Listar e deletar TODAS as chaves do reminder-scheduler (lixo do BullMQ antigo)
const keys = await redis.keys('bull:reminder-scheduler:*');
console.log(`Chaves encontradas: ${keys.length}`);

if (keys.length > 0) {
  // Deletar em lotes de 50
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50);
    await redis.del(...batch);
  }
  console.log(`✅ ${keys.length} chaves deletadas`);
}

// Confirmar estado final
const remaining = await redis.keys('bull:*');
console.log(`\nChaves BullMQ restantes: ${remaining.length}`);
for (const k of remaining.sort()) {
  const type = await redis.type(k);
  let size = '?';
  if (type === 'zset') size = await redis.zcard(k);
  else if (type === 'list') size = await redis.llen(k);
  else if (type === 'hash') size = await redis.hlen(k);
  else if (type === 'string') size = 1;
  else if (type === 'stream') size = await redis.xlen(k);
  console.log(`  ${k} (${type}=${size})`);
}

await redis.quit();
console.log('\n✅ Limpeza concluída');
