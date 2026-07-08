# Runbook Operacional — Lembrymed

Procedimentos "e se acontecer X?". Pensado para Marcus ler às 3 da manhã sem precisar consultar dev.

---

## 🚨 Z-API offline ("disconnected")

**Sintoma:**
- Paciente reclama que não recebeu lembrete
- Você recebe WhatsApp: "🚨 Lembrymed — Z-API desconectada"
- `GET /admin/queue` mostra "failed" crescendo

**Causa provável:** a instância do WhatsApp foi desconectada (reinicialização do celular, mudança de chip, mais de 2 celulares logados, cota excedida).

**Solução (5 min):**
1. Entre em https://z-api.io → login → painel da sua instância
2. Se a tela mostrar "Desconectado" ou "Aguardando QR Code":
   - Abra o WhatsApp do número do Lembrymed
   - Menu (⋮) → Aparelhos conectados → Conectar aparelho
   - Escaneie o QR Code do painel z-api.io
3. Aguarde ~30s e veja o painel virar "Conectado"
4. Em até 5 min, o worker `zapi-health` confirma a reconexão e te manda WhatsApp "✅ Z-API reconectada"

**Se a Z-API está certa mas lembretes continuam falhando:**
- `/admin/queue` → "Limpar falhos"
- Restart do Railway service (Railway dashboard → redeploy)
- Ultima opção: verifique `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` no Railway env

---

## ⚠️ Pagamento confirmado mas paciente não recebeu WhatsApp

**Sintoma:**
- Stripe dashboard mostra pagamento OK
- Paciente reclama que não chegou nada no WhatsApp

**Diagnóstico (2 min):**
1. No admin, procure o paciente por telefone.
2. Se **não aparecer**: webhook Stripe falhou na criação — vai em Railway logs → search por `stripe.webhook`. Provavelmente o `ZAPI_WEBHOOK_TOKEN` está errado ou o Stripe está re-tentando (normal, até 72h).
3. Se **aparecer** com `onboardingStep = 'welcome_sent'`: o paciente existe mas nunca respondeu. Pode ser:
   - Telefone digitado errado no checkout
   - Paciente bloqueou o bot
   - Z-API estava offline na hora do envio → clique em "Editar" → "Forçar re-onboarding" para reenviar.
4. Se aparecer como `active`: tudo ok, paciente já completou onboarding.

---

## 🔴 Alerta ao familiar disparado por engano

**Sintoma:** paciente escreve "tomei sim, por que avisou minha filha?"

**Causa:**
- Paciente respondeu em horário errado (fora da janela T+5 a T+5+30min)
- Resposta não bateu com vocabulário SIM/NÃO (ex: "claro que tomei")
- Existe dedup de 1/dia, então só pode ter acontecido 1x por dia — se estiver acontecendo repetido, é bug.

**Mitigação imediata:**
- Explicar ao paciente que o bot detecta só palavras simples como "SIM" / "NÃO"
- Verificar em `/admin/patient/<phone>` se a confirmação aparece como "Sem resposta"

**Fix longo:** adicionar mais vocábulos no array `SIM_WORDS` em `whatsapp.ts`. É PR pequeno.

---

## 🟥 Pedido LGPD recebido

**Sintoma:** você recebe WhatsApp: "⚠️ LGPD — pedido de EXCLUSÃO de dados recebido" ou "📄 LGPD — pedido de EXPORTAÇÃO recebido".

**Procedimento (até 15 dias conforme Art. 19 LGPD):**

### Exportação
1. Abrir `/admin/patient/<phone>` do paciente
2. Clicar em "Editar" > procurar botão "Exportar" (ou usar diretamente `GET /admin/patients/<id>/export` via curl/Postman com JWT)
3. Baixar o JSON resultante
4. Converter para CSV humano-legível (opcional) com qualquer ferramenta (ex: jq + csvkit)
5. Enviar por e-mail ao paciente com assunto "Seus dados do Lembrymed"
6. Em paralelo, responder WhatsApp: "Seu arquivo foi enviado para <email>"

### Exclusão
1. Aguardar 24h após o pedido (janela para o paciente mandar `CANCELAR`)
2. Se não cancelou:
   - Enviar WhatsApp de confirmação final: "Confirma a exclusão definitiva?"
   - Se paciente confirmar, chamar `DELETE /admin/patients/<id>` (no admin UI ou via curl)
   - Banco vai aplicar CASCADE e apagar tudo que a lei permite apagar (exceto `consent_logs` que permanecem pelo snapshot)
3. Enviar WhatsApp final: "Dados apagados. Obrigado por ter usado o Lembrymed 🙏"

### Dúvida ou escalação?
- privacidade@lembrymed.com.br (conta pessoal para log de decisão)
- ANPD se o paciente ameaçar acionar

---

## 💾 Migration de schema

Migrations ficam em `packages/database/migrations/`. **Nunca** rode `drizzle-kit push` contra produção sem testar em branch Neon primeiro.

### Workflow seguro

```bash
# 1. Cria branch Neon
neonctl branches create --name audit-preview-YYYY-MM-DD

# 2. Conecta DATABASE_URL ao branch e roda
DATABASE_URL_UNPOOLED="postgres://...branch-url..." psql -f packages/database/migrations/000X_nome.sql

# 3. Smoke test: roda a API contra essa branch e testa fluxo crítico
DATABASE_URL="postgres://...branch..." npm run dev:api

# 4. Se OK, aplica na main do Neon
DATABASE_URL_UNPOOLED="postgres://...main..." psql -f packages/database/migrations/000X_nome.sql

# 5. Delete a branch preview
neonctl branches delete audit-preview-YYYY-MM-DD
```

Migrations atuais:
- `0001_onboarding_nudge_count.sql` — já aplicado em produção
- `0002_cascade_and_lgpd_tables.sql` — **PENDENTE** após merge da branch `fix/onda-3-hardening-seguranca`

---

## 🐛 "Está tudo lento"

### Lembretes chegam com atraso
- Redis Railway OK? (`GET /health` mostra `redis: connected`)
- Scheduler rodando? Ver logs Railway com search `Reminders enqueued`
- BullMQ fila com backlog? `GET /admin/queue` → `waiting` alto
  - Aumentar `concurrency` no `reminder-sender.worker.ts` (hoje 10)
  - Verificar rate limit do Z-API (`limiter: { max: 50, duration: 1000 }`)

### Admin demora para carregar dashboard
- Neon cold start? Primeira query demora 300-500ms
- Query `admin/patients` com muitos pacientes? Otimização pendente (item 34 RISCOS-RESIDUAIS.md)

### Vercel build falha
- Verificar logs do Vercel dashboard
- Se erro de TypeScript: `cd apps/web && npm run typecheck` local
- Se erro de lint: ver `.github/workflows/ci.yml`
- Se erro de variável de ambiente: confirmar que `NEXT_PUBLIC_API_URL` e `STRIPE_*` estão setados

### Railway API não sobe
- Logs mostram "❌ Configuração inválida de variáveis de ambiente"?
  → Alguma env obrigatória está faltando. Lista em `apps/api/src/config/env.ts`.
  → Fail-fast é feature — proteja seu tempo evitando produção com config quebrada.

---

## 🔄 Rotacionar secret

### `NEXTAUTH_SECRET` (JWT admin)

**Impacto:** todos os tokens JWT atuais ficam inválidos → admin precisa refazer login.

```bash
# 1. Gere novo secret
openssl rand -base64 32

# 2. Atualize env var no Railway (Settings > Environment)
# 3. Redeploy
# 4. Faça login de novo no admin
```

### `ZAPI_WEBHOOK_TOKEN`

**Impacto:** Z-API vai tentar mandar webhook com token velho → rejeitado. Mensagens de pacientes param de chegar até o token no painel Z-API ser atualizado.

```bash
# 1. Gere novo
openssl rand -hex 24

# 2. No painel z-api.io → Settings → Webhook Security Token → cole o novo
# 3. No Railway → update ZAPI_WEBHOOK_TOKEN → redeploy
```

**Faça nessa ordem** para não perder mensagens.

### `STRIPE_WEBHOOK_SECRET`

```bash
# 1. Stripe Dashboard → Developers → Webhooks → selecione o endpoint → Roll secret
# 2. Copie o novo
# 3. Railway env update → redeploy
```

### `ANTHROPIC_API_KEY`

```bash
# 1. console.anthropic.com → Settings → API Keys → Create new
# 2. Railway env update
# 3. Delete a antiga no console.anthropic.com
# 4. Redeploy
```

---

## 📞 Contatos de emergência

- **Z-API suporte:** suporte@z-api.io · chat no painel
- **Stripe:** dashboard.stripe.com/support
- **Neon:** neon.tech/support
- **Railway:** railway.app/help
- **Vercel:** vercel.com/support
- **Anthropic:** support@anthropic.com
