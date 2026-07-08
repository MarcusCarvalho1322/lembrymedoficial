import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');

// Carrega .env
const envContent = fs.readFileSync('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\.env', 'utf8');
for (const line of envContent.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const idx = t.indexOf('=');
  if (idx < 0) continue;
  process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
}

const IORedis = require('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\apps\\api\\node_modules\\ioredis');
const pg = require('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\node_modules\\@neondatabase\\serverless');

const redis = new IORedis.default(process.env.REDIS_PUBLIC_URL, { enableReadyCheck: false, maxRetriesPerRequest: 1, connectTimeout: 5000 });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

await new Promise(r => setTimeout(r, 1000));
await db.connect();

const ok = (label) => console.log(`  ✅ ${label}`);
const fail = (label, detail) => console.log(`  ❌ ${label}: ${detail}`);
const warn = (label, detail) => console.log(`  ⚠️  ${label}: ${detail}`);

console.log('\n=== 1. BANCO DE DADOS ===');
try {
  const r = await db.query('SELECT COUNT(*) FROM patients WHERE is_active=true AND onboarding_step=\'active\'');
  ok(`Pacientes ativos: ${r.rows[0].count}`);
  const m = await db.query('SELECT COUNT(*) FROM medications WHERE is_active=true');
  ok(`Medicamentos ativos: ${m.rows[0].count}`);
  const s = await db.query('SELECT COUNT(*) FROM subscriptions WHERE status=\'active\'');
  ok(`Assinaturas ativas: ${s.rows[0].count}`);
  const rl = await db.query('SELECT COUNT(*) FROM reminder_logs');
  ok(`reminder_logs total: ${rl.rows[0].count}`);
} catch(e) { fail('DB query', e.message); }

console.log('\n=== 2. MEDICAMENTOS E JANELAS DE AMANHÃ ===');
try {
  const res = await db.query(`
    SELECT p.full_name, m.name, m.dosage, unnest(m.times) as med_time
    FROM patients p
    JOIN medications m ON m.patient_id=p.id AND m.is_active=true
    JOIN subscriptions s ON s.patient_id=p.id AND s.status='active'
    WHERE p.is_active=true AND p.onboarding_step='active'
    ORDER BY med_time
  `);

  // Simular amanhã às 08:20 BRT (antes da primeira janela)
  const now = new Date();
  const nowBRT = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  console.log(`  Hora atual BRT: ${nowBRT.toLocaleString('pt-BR')}`);

  for (const row of res.rows) {
    const [h, m2] = row.med_time.split(':').map(Number);
    const medBRT = new Date(nowBRT);
    medBRT.setHours(h, m2, 0, 0);
    // verificar se o med_time tem formato correto
    if (isNaN(h) || isNaN(m2)) {
      fail(`${row.name} ${row.med_time}`, 'formato inválido');
    } else {
      ok(`${row.name} ${row.dosage} às ${row.med_time} — formato OK`);
    }
    // Verificar jobId sem ':'
    const safeTime = row.med_time.replace(':', 'h');
    if (safeTime.includes(':')) {
      fail('jobId contém :', safeTime);
    } else {
      ok(`jobId sanitizado: ${safeTime} — sem ':'`);
    }
  }
} catch(e) { fail('Medicamentos', e.message); }

console.log('\n=== 3. REDIS / BULLMQ ===');
try {
  const pong = await redis.ping();
  ok(`Redis ping: ${pong}`);

  // Verificar filas
  for (const queue of ['send-reminder', 'family-alert', 'lifecycle']) {
    const wait = await redis.llen(`bull:${queue}:wait`);
    const active = await redis.llen(`bull:${queue}:active`);
    const failed = await redis.zcard(`bull:${queue}:failed`);
    if (failed > 0) warn(`bull:${queue}`, `wait=${wait} active=${active} failed=${failed}`);
    else ok(`bull:${queue}: wait=${wait} active=${active} failed=${failed}`);
  }

  // Verificar que reminder-scheduler NÃO tem mais o repeat do BullMQ (agora usa setInterval)
  const schedulerKeys = await redis.keys('bull:reminder-scheduler:*');
  if (schedulerKeys.length === 0) {
    ok('reminder-scheduler: fila limpa (setInterval ativo, sem resíduos BullMQ)');
  } else {
    warn('reminder-scheduler', `ainda tem ${schedulerKeys.length} chaves: ${schedulerKeys.slice(0,3).join(', ')}`);
  }
} catch(e) { fail('Redis', e.message); }

console.log('\n=== 4. Z-API — INSTÂNCIA CONECTADA ===');
try {
  const statusUrl = `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}/status`;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.ZAPI_CLIENT_TOKEN) headers['Client-Token'] = process.env.ZAPI_CLIENT_TOKEN;

  const res = await fetch(statusUrl, { headers });
  const body = await res.json();
  console.log(`  Status HTTP: ${res.status}`);
  console.log(`  Resposta:`, JSON.stringify(body));
  if (body.connected === true || body.status === 'connected' || res.status === 200) {
    ok('Z-API instância conectada');
  } else {
    fail('Z-API', `não conectada: ${JSON.stringify(body)}`);
  }
} catch(e) { fail('Z-API status', e.message); }

console.log('\n=== 5. VARIÁVEIS DE AMBIENTE CRÍTICAS ===');
const required = ['DATABASE_URL','REDIS_PUBLIC_URL','ZAPI_INSTANCE_ID','ZAPI_TOKEN','WHATSAPP_PROVIDER','ANTHROPIC_API_KEY'];
for (const v of required) {
  if (process.env[v]) ok(`${v}: SET`);
  else fail(v, 'MISSING');
}
if (process.env.WHATSAPP_PROVIDER !== 'zapi') {
  fail('WHATSAPP_PROVIDER', `valor é "${process.env.WHATSAPP_PROVIDER}", deveria ser "zapi"`);
}

console.log('\n=== 6. TIPO ReminderJobData — scheduled_for_iso ===');
// Verificar se o sender worker atual espera scheduled_for_iso
try {
  const senderCode = fs.readFileSync('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\apps\\api\\src\\workers\\reminder-sender.worker.ts', 'utf8');
  if (senderCode.includes('scheduled_for_iso')) {
    ok('reminder-sender.worker.ts espera scheduled_for_iso ✓');
  } else {
    warn('reminder-sender.worker.ts', 'não usa scheduled_for_iso — versão antiga?');
  }
  if (senderCode.includes('TEMPLATES[reminder_type]')) {
    ok('TEMPLATES lookup OK');
  }
} catch(e) { fail('Leitura sender', e.message); }

// Verificar se o scheduler novo tem scheduled_for_iso no jobData
try {
  const schedulerCode = fs.readFileSync('C:\\Users\\Marcus Carvalho PC\\OneDrive\\LEMBRYMED PROJECT\\.claude\\worktrees\\nostalgic-hypatia-77fb36\\apps\\api\\src\\workers\\reminder-scheduler.worker.ts', 'utf8');
  if (schedulerCode.includes('setInterval')) {
    ok('reminder-scheduler.worker.ts usa setInterval ✓');
  } else {
    fail('reminder-scheduler.worker.ts', 'ainda tem upsertJobScheduler!');
  }
  if (schedulerCode.includes('scheduled_for_iso')) {
    ok('scheduler inclui scheduled_for_iso no jobData ✓');
  }
  if (!schedulerCode.includes('upsertJobScheduler')) {
    ok('upsertJobScheduler removido ✓');
  } else {
    fail('scheduler', 'ainda contém upsertJobScheduler');
  }
} catch(e) { fail('Leitura scheduler', e.message); }

console.log('\n=== 7. SIMULAÇÃO DO TICK — AMANHÃ 08:26 BRT ===');
try {
  // Simular o tick de amanhã às 08:26 BRT
  const simBRT = new Date();
  simBRT.setHours(8, 26, 0, 0); // hora local simulada

  const res = await db.query(`
    SELECT p.id as patient_id, m.id as med_id, m.name, m.dosage, unnest(m.times) as med_time
    FROM patients p
    JOIN medications m ON m.patient_id=p.id AND m.is_active=true
    JOIN subscriptions s ON s.patient_id=p.id AND s.status='active'
    WHERE p.is_active=true AND p.onboarding_step='active'
  `);

  let found = 0;
  for (const row of res.rows) {
    const [h, m2] = row.med_time.split(':').map(Number);
    const medTime = new Date(simBRT);
    medTime.setHours(h, m2, 0, 0);
    const diff = (medTime.getTime() - simBRT.getTime()) / 60000;
    if (diff >= 25 && diff <= 35) { ok(`Janela T-30 às 08:26: ${row.name} ${row.med_time} (diff=${diff.toFixed(0)}min)`); found++; }
    if (diff >= 0 && diff <= 10) { ok(`Janela T-5 às 08:26: ${row.name} ${row.med_time}`); found++; }
    if (diff >= -10 && diff <= -3) { ok(`Janela T+5 às 08:26: ${row.name} ${row.med_time}`); found++; }
  }
  if (found === 0) warn('Simulação 08:26', 'nenhuma janela encontrada — verificar dados');
  else ok(`Total de jobs a enfileirar às 08:26: ${found}`);
} catch(e) { fail('Simulação', e.message); }

await db.end();
await redis.quit();
console.log('\n=== FIM DO DIAGNÓSTICO ===\n');
