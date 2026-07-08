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

console.log('Limpando entradas obsoletas do Redis...');

// Limpar o repeat job quebrado do send-reminder (era o bug antigo)
const deleted1 = await redis.del('bull:send-reminder:repeat:28a926b8fcd4b76b823f351dd1005891:1777064700000');
console.log(`Deletado repeat obsoleto: ${deleted1}`);

// Limpar completed jobs acumulados (no BullMQ v4+ completed é zset)
const completedType = await redis.type('bull:send-reminder:completed');
let before = 0;
if (completedType === 'list') before = await redis.llen('bull:send-reminder:completed');
else if (completedType === 'zset') before = await redis.zcard('bull:send-reminder:completed');
await redis.del('bull:send-reminder:completed');
console.log(`Completed jobs limpos: ${before} entradas (tipo: ${completedType})`);

// Limpar failed jobs
const failedType = await redis.type('bull:send-reminder:failed');
let failedBefore = 0;
if (failedType === 'list') failedBefore = await redis.llen('bull:send-reminder:failed');
else if (failedType === 'zset') failedBefore = await redis.zcard('bull:send-reminder:failed');
await redis.del('bull:send-reminder:failed');
console.log(`Failed jobs limpos: ${failedBefore} entradas (tipo: ${failedType})`);

// Verificar estado final das filas
console.log('\n=== Estado final Redis ===');
const keys = await redis.keys('bull:*');
for (const k of keys.sort()) {
  const type = await redis.type(k);
  let len = '?';
  if (type === 'list') len = await redis.llen(k);
  else if (type === 'zset') len = await redis.zcard(k);
  else if (type === 'hash') len = await redis.hlen(k);
  else if (type === 'string') len = 1;
  console.log(`  ${k} (${type}): ${len}`);
}

await redis.quit();
console.log('\nLimpeza concluída!');
