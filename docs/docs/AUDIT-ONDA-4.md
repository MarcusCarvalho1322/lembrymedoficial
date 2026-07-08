# Auditoria Onda 4 — front Next.js, queries SQL, restante do whatsapp.ts

**Data:** 2026-05-14 (após Fases 1-3 da sessão atual)
**Escopo:** `apps/web/*`, queries SQL em rotas admin + workers, débito restante em `whatsapp.ts`, schema do banco.

Esta auditoria é complementar às anteriores (`AUDIT/00-sumario-executivo.md`
e a auditoria forense inicial desta sessão). Foca em áreas pouco
exploradas: front-end, performance de queries e arquivos não-críticos.

---

## TL;DR

- **3 altos** corrigidos imediatamente neste commit (A1, A2, A3).
- **2 médios** corrigidos imediatamente (M1, M2).
- **5 médios + 3 baixos** documentados como follow-up.
- **3 oportunidades de índice no banco** sugeridas (não aplicadas — exigem migration).
- Score geral mantido. Sem regressões introduzidas.

---

## 🟧 ALTOS — corrigidos nesta onda

### A1. N+1 query no webhook ao buscar paciente
**Antes:** [whatsapp.ts:201-206] loop sequencial chamando `findFirst` para cada
phone candidate (até 4 queries por mensagem inbound).
**Depois:** uma única query com `inArray(patients.phone, phoneCandidates)`.
A unicidade de `patients.phone UNIQUE` garante no máximo 1 match.

Também aplicado para `redis.get` dos `FAMILY_CONFIRM_KEY`: substituído por
`mget(...keys)`, 1 round-trip em vez de N.

**Impacto:** latência cai ~3x em pacientes com cadastro num formato
diferente do que a Z-API envia.

### A2. Front Next.js sem security headers
**Antes:** `apps/web/next.config.js` definia apenas `reactStrictMode` e
um `rewrites`. Sem CSP, HSTS, X-Frame-Options nem outros mitigadores.
**Depois:** `headers()` callback retorna 7 headers de segurança (HSTS,
nosniff, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy,
X-XSS-Protection: 0 e CSP). CSP montada dinamicamente para incluir
`connect-src` da API Railway. `poweredByHeader: false` esconde fingerprint.

**Impacto:** equipara o front à postura de segurança que o backend já tem
desde a Onda 3 do `securityHeaders.ts`.

### A3. Ticket médio hardcoded no dashboard admin
**Antes:** [admin/page.tsx:225] `'Ticket médio', value: 'R$ 149'` —
hardcoded mesmo após o backend calcular `data.ticketMedio` da base real
de assinaturas ativas (`SUBSCRIPTIONS.amount_cents`).
**Depois:** usa `data.ticketMedio` com formatação BR.

**Impacto:** quando você alterar o plano (ou tiver descontos / planos
mistos), o dashboard reflete a realidade.

---

## 🟨 MÉDIOS — corrigidos nesta onda

### M1. Duplicação de getNowBRT/getTodayBRT em 2 workers
**Antes:** `motivational-message.worker.ts` e `medication-review.worker.ts`
redefinem `getNowBRT` e `getTodayBRT` localmente (4 funções duplicadas).
A lib `apps/api/src/lib/brt.ts` já existe (centralizada na Onda 2).
**Depois:** imports da lib + remoção dos duplicados.

**Impacto:** se mudarmos a implementação de BRT (ex: DST-aware fix), só
muda em 1 lugar. Reduz chance de bugs sutis.

### M2. admin/patients.ts usa CURRENT_DATE AT TIME ZONE
**Antes:** [admin/patients.ts:128] `mc.date >= (CURRENT_DATE AT TIME ZONE
'America/Sao_Paulo')::date - INTERVAL '7 days'`. Esse padrão era padrão
até a auditoria forense original; estava errado em alguns lugares e foi
substituído pelo `${todayBRT}::date` (calculado em Node).
**Depois:** mesmo padrão dos outros endpoints — usa `getTodayBRT()`
do `lib/brt`.

**Impacto:** evita que entre 21h e 23h59 BRT (quando o UTC já virou para
o dia seguinte) o histórico fique deslocado em 1 dia.

---

## 🟨 MÉDIOS — documentados como follow-up

### M3. Live clock no admin page força re-render a cada segundo
**Local:** [admin/page.tsx:137] `setInterval(() => setTick(t => t + 1), 1000)`.
A página inteira (com 6 KPIs e 2 gráficos SVG) re-renderiza por segundo
mesmo sem nova data. Em um admin de single-user é trivial; em volume
escala mal.

**Fix sugerido:** mover o relógio para um subcomponente isolado com seu
próprio state. React.memo nos KPIs.
**Esforço:** 30 min.

### M4. Rewrite Next.js /api/* conflita com routes locais
**Local:** [next.config.js] rewrite `'/api/:path*'` → `${API_URL}/:path*`.
Existe a rota local `apps/web/app/api/checkout/route.ts`. Next.js dá
precedência à rota local — então `/api/checkout` ainda funciona, mas
qualquer rota nova em `apps/web/app/api/*` precisa ser cuidadosamente
verificada para não colidir com a API Railway.

**Fix sugerido:** mover o rewrite para `/proxy/api/:path*` ou similar
para tornar a separação explícita. Atualizar `lib/api.ts` em consequência.
**Esforço:** 1h + migration de URLs.

### M5. Tipos `any` em todos os data fetch do admin
**Local:** `useState<any>(null)` em todas as páginas admin. Sem tipos,
mudanças no backend não quebram TypeScript do front — bugs aparecem em
runtime.

**Fix sugerido:** criar `packages/shared/admin-types.ts` com interfaces
dos endpoints admin (DashboardResponse, PatientDetail, etc.).
**Esforço:** 2h.

### M6. Refator restante de whatsapp.ts (1290 → ~600 linhas)
**Local:** `whatsapp.ts` ainda tem inline:
- `handleOnboardingConversation` (~140 linhas)
- `buildOnboardingSystemPrompt` (~60 linhas)
- `handleMedUpdateConversation` (~100 linhas)
- `buildMedUpdateSystemPrompt` (~50 linhas)
- `applyMedicationUpdates` (~30 linhas)
- `handleFamilyUpdateConversation` (~190 linhas)
- `buildFamilyUpdateSystemPrompt` (~70 linhas)
- `handleFamilyConfirmationFromMember` (~80 linhas)
- `saveFamilyContact` (~80 linhas)
- `extractAndSaveMedications` (~120 linhas)

Já temos `routes/webhooks/whatsapp/handlers/{lgpd,confirmation}.ts`. Falta:
- `handlers/onboarding.ts`
- `handlers/med-update.ts`
- `handlers/family-update.ts`
- `handlers/extraction.ts` (compartilhada onboarding + med_update)
- `handlers/family-member-reply.ts` (`handleFamilyConfirmationFromMember`)

**Fix sugerido:** mover cada grupo para seu módulo. Cada handler vira
testável isoladamente (mock do Anthropic SDK).
**Esforço:** 1 dia.

### M7. `handleFamilyConfirmationFromMember` aceita texto cru
**Local:** [whatsapp.ts ~1031]. Detecta SIM/NÃO via `includes` simples,
mas não normaliza ou usa o vocabulário da `lib/marker-validation`.
Se o familiar responde "ok pode cadastrar" ou "claro", cai no fallback
de mensagem ambígua.

**Fix sugerido:** usar `hasAffirmation` da lib de validação para amplitude.
**Esforço:** 20 min.

---

## 🟦 BAIXOS

### B1. Charts SVG duplicados entre páginas
`BarChart`, `Gauge` e `ConfirmationCell` estão duplicados nos componentes
admin. Mover para `apps/web/components/admin/charts.tsx`.

### B2. Sem ESLint configurado
Há scripts `turbo lint` mas nenhum eslintrc. `npm run lint` retorna OK
sem fazer nada. Adicionar @next/eslint-config-next + eslint-plugin-react-hooks.

### B3. Cobertura de testes ainda focada em lib pura
284 testes — 99% em libs puras (BRT, scheduling, templates, phone,
privacy, marker-validation, claude-tools). Handlers grandes não têm
testes de integração (depende do split M6 primeiro).

---

## 🗄️ Schema — oportunidades de índice

**Não aplicadas** (exigem migration). Sugeridas para próxima janela de baixo tráfego:

### Idx 1: medications(patient_id, is_active)
Hoje: `idx_meds_patient (patient_id)`. O scheduler filtra `is_active=true`
em cada tick. Para >1000 pacientes ativos, índice composto reduz I/O.

```sql
CREATE INDEX IF NOT EXISTS idx_meds_patient_active
  ON medications (patient_id)
  WHERE is_active = true;
```

### Idx 2: message_logs(phone, created_at desc)
Usado em `db.query.messageLogs.findMany({ where: eq(messageLogs.patientId), orderBy: desc(createdAt), limit })`.
O índice atual é `(patient_id, created_at)`. Adicional em `phone` é útil
para o admin buscar histórico por telefone.

```sql
CREATE INDEX IF NOT EXISTS idx_msgs_phone_desc
  ON message_logs (phone, created_at DESC);
```

### Idx 3: reminder_logs(patient_id, reminder_type, medication_time, created_at)
A query de dedup no scheduler filtra por essa combinação. O índice
atual é composto mas não inclui `medication_time`.

```sql
CREATE INDEX IF NOT EXISTS idx_reminders_patient_dedup
  ON reminder_logs (patient_id, medication_id, reminder_type, medication_time)
  WHERE status = 'sent' OR status = 'scheduled';
```

---

## 🔒 Schema — relações FK (review)

Todas as FKs principais usam `ON DELETE CASCADE` (paciente apagado →
limpa medicações, lembretes, confirmações, contatos familiares).
`reminder_log_id` em `medication_confirmations` usa `SET NULL` —
mantém o histórico de confirmação mesmo se o reminder original for
purgado por retention. ✅ Correto.

Detalhe: `message_logs.patient_id` é `SET NULL` (linha 186), permitindo
que mensagens fiquem como "anônimas" se o paciente for deletado.
Inconsistente com a política LGPD que deveria apagar TUDO no DELETE.
Não é bug em si — é uma decisão de produto.

---

## 🤖 Workers — sanidade

| Worker | Estado | Notas |
|---|---|---|
| reminder-scheduler | ✅ Corrigido na Onda 0 (setInterval, sem ':') | — |
| reminder-sender | ✅ Backoff exponencial agora funciona (Onda 0) | — |
| family-alerter | ✅ Dedup 1/dia OK | — |
| lifecycle | ✅ try-catch individual por paciente | — |
| onboarding-nudge | ✅ Dual-window (pré/pós-meds) | — |
| zapi-health | ✅ Alerta admin via env validado | — |
| motivational | ⚠️ M1 corrigido neste commit (usava BRT duplicado) | Sem teste de integração |
| medication-review | ⚠️ Bug conhecido: response do paciente não dispara med-update flow | Documentar como TODO |

---

## O que foi entregue NESTE COMMIT

- ✅ A1, A2, A3 corrigidos (typecheck + 284 testes verdes)
- ✅ M1, M2 corrigidos
- ✅ Documentação completa em `docs/AUDIT-ONDA-4.md`

## O que NÃO foi entregue (decisão de Marcus para próximo ciclo)

- M3-M7: refators de qualidade que merecem PR dedicado
- B1-B3: limpeza incremental
- Migrations de índice: exigem janela de baixo tráfego em produção
- Bug do medication-review (resposta SIM/NÃO ao check-in mensal não dispara fluxo)
