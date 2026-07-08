# Riscos Residuais — Auditoria LEMBRYMED

Decisões que passam do escopo autônomo da Onda 3 e aguardam aprovação de Marcus para execução em ondas futuras ou deploy direto em produção.

**Categorias:**
- **ACEITO** — risco conhecido e considerado aceitável para a fase atual do produto
- **PENDENTE DECISÃO** — aguarda escolha de Marcus antes de executar
- **PENDENTE DEPLOY** — correção pronta em código, mas exige ação manual em produção

---

## NOVO (2026-05-22) — Neon Compute Sempre Ligado

### Item 49 — Scale to Zero incompatível com arquitetura de lembretes em produção

**Diagnóstico realizado em 2026-05-22:**

O Neon acusou 129 CU-horas em 3 dias (58% do compute), com Scale to Zero habilitado mas ineficaz. Causa raiz identificada e parcialmente corrigida:

| Fonte de queries | Frequência antes | Frequência após fix | Impacto |
|---|---|---|---|
| Railway health check → `SELECT 1` | ~120/hora | ~12/hora | ✅ Corrigido (cache Redis 5min) |
| Scheduler `fetchActiveMeds()` | 60/hora (1/min) | 40/hora (1/90s) | ✅ Melhorado (cache Redis 90s) |
| Workers revisão/motivacional | 60/hora cada (early-return correto) | Inalterado (não batem no Neon fora do horário) | ✅ Sem problema |

**Conclusão arquitetural:** com um scheduler de medicamentos que precisa rodar a cada minuto para garantir entregas no horário, o Neon NUNCA terá 5 minutos consecutivos de silêncio suficientes para o Scale to Zero suspender o compute. Isso é comportamento esperado para qualquer app de alertas em tempo real.

**Ação necessária (👤 Marcus — decisão de produto):**

- **Opção A (recomendada):** Migrar para **Neon Launch Plan** ($19/mês). Inclui 300 CU-horas/mês. Com as otimizações de cache aplicadas, o consumo estimado fica em ~200 CU-horas/mês — dentro do plano sem custo extra. Elimina o alerta e garante operação previsível.
- **Opção B:** Manter Free Tier e aceitar o aviso. O app continua funcionando; o Neon não desliga — apenas não economiza compute. Risco: se a Neon alterar a política de Free Tier, o compute pode ser suspenso manualmente.
- **Opção C (longo prazo):** Migrar agendamento para Redis puro (armazenar todos os horários de medicamentos em Redis e só sincronizar com Neon em eventos de mudança). Reduz queries ao banco de 40/hora para ~1-2/hora. Estimativa de desenvolvimento: 1-2 dias. Válido quando o volume de pacientes justificar.

**Status:** correções de code já aplicadas e commitadas em `293e0a3`. Ação de infraestrutura pendente (escolha do plano).

---

## PENDENTE DECISÃO

### Item 07 — Canal alternativo de lembrete quando Z-API cai
**Pergunta:** qual fallback?
- (a) Segunda instância Z-API só para ops (alerta admin)
- (b) SMS Zenvia/TotalVoice para pacientes VIP
- (c) Email Resend para todos
- (d) Só Sentry — aceitar que lembretes param até Marcus reabrir

**Recomendação:** começar com (a) + (c), adiar (b) até ter base para justificar custo.

**Bloqueia:** cenário de risco de vida se Z-API cair por horas.

---

### Item 08 — Separar workers do Express em 2 services Railway
**Impacto:** se a API crasha, os workers crashavam junto. Hoje ambos sobem no mesmo processo.

**Custo:** ~15-20 USD/mês adicionais Railway.

**Recomendação:** fazer quando volume passar de ~1000 pacientes ativos. Até lá, o risco é aceitável.

---

### Item 10 (parte) — JWT admin em cookie HttpOnly
**Hoje:** `localStorage` → vulnerável a XSS.
**Mitigação parcial aplicada na Onda 3:** CSP restritivo + security headers.
**Próximo passo:** mover para cookie HttpOnly + SameSite=Strict + CSRF token.

**Motivo para adiar:** exige mudança coordenada frontend admin + backend. Se a CSP estiver apertada, o risco prático cai bastante.

---

### Item 30 (parte) — Endpoint público `/public/onboarding-status?session_id=...`
Permitiria que `/success` mostre status do onboarding ao paciente em vez de só "parabéns". Porém expõe nova superfície pública.

**Recomendação:** implementar apenas se o churn pós-checkout for relatado como problema (hoje, landing tem disclaimer de "aguarde WhatsApp").

---

### Item 34 (parte) — Índices adicionais em Neon
Já gerada a migration 0002 com o índice composto para dedup de family_alert_logs. Se o `/admin/patients` ficar lento em volume, avaliar índice covering para os 3 subqueries de contagem.

**Bloqueia:** nada urgente.

---

### Item 48 — Arquivos grandes na raiz do repo
`Gemini_Generated_Image_p882v1...png` (3.6MB), `Design sem nome.png/.svg` (1.7MB), `logo nova branca FT.PNG` (620KB), `logo nova png.png` (950KB), `files.zip`, `LEMBRYMED_MASTER_PROMPT_v1.md`.

**Pergunta:** são assets de referência (mantêm) ou lixo (deletar)? Impacta clone speed e CI.

---

## PENDENTE DEPLOY (ação em infraestrutura)

### Migration 0002 no Neon
`packages/database/migrations/0002_cascade_and_lgpd_tables.sql` precisa ser aplicado em produção. Sugestão:

1. **Neon Preview Branch:** abrir branch, rodar o SQL, verificar que nada quebra.
2. **Produção:** rodar via `psql "$DATABASE_URL_UNPOOLED" < packages/database/migrations/0002_cascade_and_lgpd_tables.sql` em janela de baixo tráfego (madrugada BRT).
3. Verificar com:
   ```sql
   SELECT conname FROM pg_constraint WHERE conrelid = 'reminder_logs'::regclass;
   SELECT to_regclass('consent_logs'), to_regclass('admin_audit_logs'), to_regclass('privacy_policies');
   ```

**Rollback:** a migration é ADDITIVE (só adiciona CASCADE e cria tabelas). Rollback requer DROP das tabelas novas + restaurar FKs antigas — possível mas manual.

---

### Env vars novas no Railway
Depois do deploy da branch `fix/onda-3-hardening-seguranca`, definir no Railway:
- `NEXTAUTH_SECRET` — obrigatório (gere com `openssl rand -base64 32`)
- `ZAPI_WEBHOOK_TOKEN` — obrigatório em produção (configurar no painel Z-API também)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (já existiam; validar)
- `NODE_ENV=production`
- `ADMIN_WHATSAPP` — opcional, número com código país para receber alerta da Z-API caida e LGPD requests (ex: 5565999999999)
- `SENTRY_DSN` — opcional, se quiser captura de erros

**IMPORTANTE:** a primeira vez que o código novo subir, se `NEXTAUTH_SECRET` ou `ZAPI_WEBHOOK_TOKEN` não estiverem definidos, o processo encerra com código 1 (fail fast). Isso é o comportamento correto, mas exige que as vars sejam configuradas ANTES do deploy.

---

### Env vars novas no Vercel
- `NEXT_PUBLIC_WEB_URL` — se diferente de `VERCEL_PROJECT_PRODUCTION_URL` (ex: `https://lembrymed.com.br`)
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ANNUAL` (já existem; conferir)

---

## ACEITO (risco conhecido, decisão documentada)

### Providers WhatsApp alternativos (360dialog, Meta, Twilio) no código
Mantidos como fallback/documentação, mas só Z-API é suportado oficialmente. Não vamos investir em testar os outros providers salvo mudança de decisão.

### `agent_session_id` com dupla função (ID sessão legacy + flag de modo)
Acoplamento conhecido. Migração para coluna dedicada `interaction_mode` fica para refactor futuro.

### `message_logs.phone` completo sem mascaramento
Aceito para fins de busca/debug via admin. `content` já tem retention de 90 dias (Onda 3). Se LGPD-compliance audit exigir mais, adicionar helper `maskPhone` nos logs de Winston.

### Sem Sentry na stack
Documentado como gap. `SENTRY_DSN` opcional já no env schema — basta configurar quando decidirmos ativar. Não é obrigatório para o MVP.

### Single-admin (sem multi-tenant B2B)
Consistente com o modelo de produto atual. Se mudar, toda a arquitetura de autorização precisa ser revisada.

### `ADMIN_WHATSAPP` como env var (não tabela)
Para o MVP, um único número recebe alertas ops. Escalabilidade: quando tiver mais devs, migrar para tabela `admins` com role-based permissions.
