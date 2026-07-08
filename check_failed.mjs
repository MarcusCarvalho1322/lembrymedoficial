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

// Verificar jobs falhos do reminder-scheduler
const failedIds = await redis.zrange('bull:reminder-scheduler:failed', 0, -1);
console.log('IDs dos jobs falhos:', failedIds);

for (const id of failedIds) {
  const job = await redis.hgetall(`bull:reminder-scheduler:${id}`);
  if (job && job.failedReason) {
    console.log(`\nJob ${id}:`);
    console.log('  failedReason:', job.failedReason);
    console.log('  stacktrace:', (job.stacktrace || '').substring(0, 300));
  }
}

// Verificar o job scheduler ativo (reminder-scheduler-cron)
console.log('\n=== Job Scheduler ativo ===');
const schedulerHash = await redis.hgetall('bull:reminder-scheduler:repeat:reminder-scheduler-cron');
console.log('scheduler config:', JSON.stringify(schedulerHash, null, 2));

// Próximo disparo
const nextKeys = await redis.keys('bull:reminder-scheduler:repeat:reminder-scheduler-cron:*');
console.log('\nPróximos disparos agendados:', nextKeys.length, 'jobs');
if (nextKeys.length > 0) {
  const nextJob = await redis.hgetall(nextKeys[0]);
  const delay = nextJob.delay ? parseInt(nextJob.delay) : 0;
  console.log('Próximo timestamp:', nextJob.timestamp ? new Date(parseInt(nextJob.timestamp)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'N/A');
}

await redis.quit();
