# Roadmap — Lembrymed

Roadmap técnico pós-auditoria 2026-04-22. Priorização com viés de healthtech (confiabilidade > features novas).

---

## Agora (próximos 30 dias)

### 1. Merge + deploy da branch `fix/onda-3-hardening-seguranca`
- Configurar as env vars novas no Railway (ver `AUDIT/RISCOS-RESIDUAIS.md`)
- Rodar migration 0002 em Neon preview → depois prod
- Deploy Railway → smoke test fluxo completo
- Deploy Vercel → verificar Lighthouse

**Esforço:** 2h de trabalho supervisionado.
**Risco:** baixo (branch verde em typecheck + build + 27 testes).

### 2. Definir o fallback para falha de Z-API (Item 07)
Decisão aberta: SMS, email, 2ª instância Z-API ou Sentry-only?

**Recomendação:** começar com email Resend (R$ 0 até 3000/mês) + manter Sentry desativado até escalar. Implementação: ~4h.

### 3. `ADMIN_WHATSAPP` configurado
Um único número admin (seu) que recebe alertas críticos. Gratuito. Já implementado — só configurar no Railway.

---

## Curto prazo (30-90 dias)

### 4. Separar workers em service Railway próprio (Item 08)
Impede que bug na API derrube lembretes. ~+15-20 USD/mês. Fazer quando passarmos de 500 pacientes ativos.

### 5. JWT admin em cookie HttpOnly (Item 10)
Migração coordenada frontend/backend. Benefício: mitiga XSS → roubo de token. Esforço: ~1 dia.

### 6. Dashboard de healthcheck público (`/status`)
Página leve mostrando: "Lembretes OK", "Z-API conectada há X minutos", "Último envio: HH:MM BRT". Aumenta confiança e facilita suporte.

### 7. Roteamento de perguntas médicas
Hoje, se paciente ativo pergunta "posso tomar junto com café?", o bot ignora silencioso. Adicionar um handler que responda: "Sou apenas um bot de lembretes; para perguntas médicas, consulte seu médico ou a bula."

### 8. PR para split do `LembrymedLanding` em subcomponentes
Facilita manter + testar componentes isolados. Item 38.

---

## Médio prazo (3-6 meses)

### 9. Portal do paciente (PWA leve)
Caso chegue a demanda: histórico visual de adesão, botão "exportar meus dados", "atualizar meds". **Apenas** se houver requests explícitas — adiciona complexidade considerável.

### 10. Assinatura recorrente (Stripe)
Hoje é compra única anual. Assinatura mensal recorrente reduz churn mas exige ajuste do lifecycle worker (não mais "vence em 30d" e sim "pagou este mês?").

### 11. Tela de suporte (admin)
Conversor one-click de WhatsApp ida-e-volta com histórico do paciente + botão "enviar lembrete agora" para casos de suporte.

### 12. Métricas de adesão exportáveis para o médico prescritor
Relatório PDF mensal automatizado com dados de adesão — já temos o JSON, precisa só gerador PDF (html2canvas ou puppeteer).

---

## Longo prazo (6-12 meses)

### 13. Multi-tenant B2B
Se BIZZ.IA vender Lembrymed para clínicas, cada clínica teria seu próprio admin + pacientes. Significa:
- Scope de `patients` por `clinic_id`
- RLS ou scope middleware em 100% das queries admin
- Billing per clinic

### 14. Integração com prescritor digital
Se clínica usar Prontuário Eletrônico com API de prescrição, recebíamos a lista direto do médico (sem o paciente ter que transcrever).

### 15. Análise agregada anonimizada
Estatísticas de adesão por cidade/idade/diagnóstico para pesquisa acadêmica (com opt-in adicional + anonimização).

### 16. App paciente (se inevitável)
Só depois de validação + demanda real. React Native ou PWA nativa.

---

## Dívidas técnicas conhecidas

Ver `AUDIT/RISCOS-RESIDUAIS.md` para a lista completa. Resumo:
- Criptografia aplicação-level em `message_logs.content` (hoje só Neon at-rest)
- `agent_session_id` com dupla função (flag + ID) → migrar para coluna dedicada
- Testes E2E (Playwright) ainda não configurados
- Queries do `/admin/patients` com subquery — otimizar se >500 pacientes

---

## KPIs para medir sucesso do roadmap

| KPI                                   | Baseline hoje              | Meta 6 meses            |
|---------------------------------------|----------------------------|--------------------------|
| Taxa de entrega de lembrete           | (não medido)                | > 98% (excl Z-API fora) |
| Taxa de confirmação                   | ~40-60% (estimativa)        | > 70%                   |
| Churn mensal                          | ?                           | < 5%                    |
| LCP na landing                        | ~2.8s (estimativa)          | < 1.8s                  |
| Uptime da API                         | (não medido)                | > 99.5%                 |
| Security Posture Score (auditoria)    | 88/100                      | ≥ 95/100                |
| Tempo de resposta a LGPD request      | N/A                          | < 7 dias                |
| Cobertura de testes                   | ~5% (funções puras)          | > 40%                   |
