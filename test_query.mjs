import { neon } from '@neondatabase/serverless';
const sql = neon('postgresql://neondb_owner:npg_oBH7KcaZ8Eys@ep-sweet-river-ai9f5mdj-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

const msgs = await sql`
  SELECT phone, direction, LEFT(content, 280) as content, media_type, created_at::text
  FROM message_logs
  WHERE created_at > NOW() - INTERVAL '60 minutes'
  ORDER BY created_at DESC
  LIMIT 15
`;
console.log(`=== ÚLTIMAS ${msgs.length} MENSAGENS (60 min) ===\n`);
msgs.forEach(m => {
  console.log(`${m.direction.toUpperCase()} [${m.phone}] ${m.created_at} | ${m.media_type || 'text'}`);
  console.log(m.content);
  console.log('');
});

const now = await sql`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::text as brt`;
console.log('AGORA (BRT):', now[0].brt);
