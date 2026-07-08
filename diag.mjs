import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

// Carrega .env manualmente
const fs = require('fs');
const envContent = fs.readFileSync('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\.env', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx < 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
  process.env[key] = val;
}

console.log('=== ENV CHECK ===');
console.log('WHATSAPP_PROVIDER:', env.WHATSAPP_PROVIDER);
console.log('ZAPI_INSTANCE_ID:', env.ZAPI_INSTANCE_ID ? 'SET' : 'MISSING');
console.log('ZAPI_TOKEN:', env.ZAPI_TOKEN ? 'SET' : 'MISSING');
console.log('ZAPI_CLIENT_TOKEN:', env.ZAPI_CLIENT_TOKEN ? 'SET' : 'MISSING');
console.log('DATABASE_URL:', env.DATABASE_URL ? env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@') : 'MISSING');
console.log('REDIS_PUBLIC_URL:', env.REDIS_PUBLIC_URL || 'MISSING');

// 1. REDIS - checar jobs failed/completed no send-reminder
console.log('\n=== REDIS: send-reminder queues ===');
const IORedis = require('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\apps\\api\\node_modules\\ioredis');
const redisUrl = env.REDIS_PUBLIC_URL || env.REDIS_URL;
const redis = new IORedis.default(redisUrl, { enableReadyCheck: false, maxRetriesPerRequest: 1, lazyConnect: false, connectTimeout: 5000 });

await new Promise(resolve => setTimeout(resolve, 1000));

// BullMQ usa sorted sets (zset) para failed/completed/delayed e list para wait/active
// Prefixo padrão BullMQ: bull:{queueName}:
const failedLen = await redis.zcard('bull:send-reminder:failed');
const completedLen = await redis.zcard('bull:send-reminder:completed');
const delayedLen = await redis.zcard('bull:send-reminder:delayed');
const waitLen = await redis.llen('bull:send-reminder:wait');
const activeLen = await redis.llen('bull:send-reminder:active');
console.log('wait:', waitLen, '| active:', activeLen, '| delayed:', delayedLen, '| completed:', completedLen, '| failed:', failedLen);

// Checar também as chaves que existem para este prefixo
const keys = await redis.keys('bull:send-reminder:*');
console.log('Keys encontradas:', keys.slice(0, 20));

if (failedLen > 0) {
  const failedJobs = await redis.zrange('bull:send-reminder:failed', 0, 2);
  console.log('Failed jobs (até 3):');
  for (const jobId of failedJobs) {
    try {
      const jobData = await redis.hgetall(`bull:send-reminder:${jobId}`);
      console.log(JSON.stringify({ id: jobId, failedReason: jobData.failedReason, name: jobData.name }));
    } catch(e) { console.log('jobId:', jobId); }
  }
}

// 2. HORÁRIO BRT atual
console.log('\n=== HORÁRIO ATUAL ===');
const now = new Date();
const nowBRT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
console.log('UTC:', now.toISOString());
console.log('BRT:', nowBRT.toLocaleString('pt-BR'));

// 3. Simular scheduler - quais meds estão na janela agora?
console.log('\n=== SIMULAÇÃO SCHEDULER ===');
const { Client } = require('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\node_modules\\@neondatabase\\serverless');
const client = new Client({ connectionString: env.DATABASE_URL });
await client.connect();

const result = await client.query(`
  SELECT p.full_name, p.phone, m.name as med_name, m.dosage, unnest(m.times) as med_time
  FROM patients p
  JOIN medications m ON m.patient_id = p.id AND m.is_active = true
  JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
  WHERE p.is_active = true AND p.onboarding_step = 'active'
`);

for (const row of result.rows) {
  const [hours, minutes] = row.med_time.split(':').map(Number);
  const medTimeBRT = new Date(nowBRT);
  medTimeBRT.setHours(hours, minutes, 0, 0);
  const diffMin = (medTimeBRT.getTime() - nowBRT.getTime()) / 60000;
  let type = null;
  if (diffMin >= 25 && diffMin <= 35) type = 't_minus_30';
  else if (diffMin >= 0 && diffMin <= 10) type = 't_minus_5';
  else if (diffMin >= -10 && diffMin <= -3) type = 't_plus_5';
  console.log(`${row.med_name} ${row.med_time} → diff=${diffMin.toFixed(1)}min → tipo=${type || 'FORA DA JANELA'}`);
}

// 4. Teste direto Z-API
console.log('\n=== TESTE Z-API ===');
const zapiUrl = `https://api.z-api.io/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`;
const headers = { 'Content-Type': 'application/json' };
if (env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = env.ZAPI_CLIENT_TOKEN;

try {
  const res = await fetch(zapiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone: '5574999774500', message: '🔧 Teste diagnóstico Lembrymed — sistema funcionando!' })
  });
  const body = await res.text();
  console.log('Status:', res.status);
  console.log('Resposta:', body.substring(0, 300));
} catch(e) {
  console.log('ERRO Z-API:', e.message);
}

// 5. Teste DB write
console.log('\n=== TESTE DB WRITE ===');
try {
  const patRes = await client.query(`SELECT id, full_name FROM patients WHERE phone = '5574999774500' LIMIT 1`);
  const medRes = await client.query(`SELECT id FROM medications WHERE patient_id = $1 LIMIT 1`, [patRes.rows[0].id]);

  await client.query(`
    INSERT INTO reminder_logs (patient_id, medication_id, reminder_type, medication_time, scheduled_for, status)
    VALUES ($1, $2, 'test', '12:00', NOW(), 'test')
  `, [patRes.rows[0].id, medRes.rows[0].id]);
  console.log('INSERT reminder_logs OK');

  await client.query(`DELETE FROM reminder_logs WHERE status = 'test'`);
  console.log('DELETE limpeza OK');
} catch(e) {
  console.log('ERRO DB WRITE:', e.message);
}

await client.end();
await redis.quit();
console.log('\n=== FIM DIAGNÓSTICO ===');
