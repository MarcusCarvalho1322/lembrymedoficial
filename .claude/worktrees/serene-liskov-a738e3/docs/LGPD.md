# LGPD — Conformidade do Lembrymed

**Auditoria interna:** 2026-04-22
**Responsável (DPO):** Dr. Marcus Cardoso Carvalho · privacidade@lembrymed.com.br

---

## 1. Base legal do tratamento

| Tratamento                         | Base legal                                             | Artigo     |
|------------------------------------|--------------------------------------------------------|-----------|
| Dados identificação (nome, email, phone) | Consentimento                                 | Art. 7 IX |
| Dados de saúde (medicamentos, horários)  | Consentimento + tutela da saúde            | Art. 11 II-a |
| Dados de pagamento (Stripe)              | Execução de contrato                        | Art. 7 V  |
| Dados de log (IP, user-agent)            | Legítimo interesse (segurança/antifraude)   | Art. 7 IX |

---

## 2. Checklist de compliance

### Princípios gerais (Art. 6)

- [x] **Finalidade específica** — lembretes de medicação. Política de Privacidade pública em `/privacidade`.
- [x] **Adequação** — cada dado coletado é usado para sua finalidade declarada.
- [x] **Necessidade** — não coletamos CPF, endereço, dados bancários (são da Stripe).
- [x] **Livre acesso** — paciente pode `EXPORTAR MEUS DADOS` via WhatsApp a qualquer hora.
- [x] **Qualidade** — admin pode atualizar dados via `/admin/patient/...`.
- [x] **Transparência** — Política pública + consentimento explícito + fornecedores listados.
- [x] **Segurança** — TLS, bcrypt, audit logs, retention.
- [x] **Prevenção** — rate limit, webhook signature, dedup, CORS restrito, security headers.
- [x] **Não discriminação** — não usamos dados para fins que prejudiquem o titular.
- [x] **Responsabilização** — tabela `admin_audit_logs` + versionamento de política.

### Consentimento (Art. 8)

- [x] Consentimento por escrito/inequívoco — checkbox explícito no checkout.
- [x] Finalidade especificada — link para Política clicável.
- [x] Revogação facilitada — palavra-chave WhatsApp `EXCLUIR MEUS DADOS`.
- [x] Registro com timestamp, versão, IP, user-agent — tabela `consent_logs`.

### Direitos do titular (Art. 18)

Canais disponíveis:
1. **WhatsApp:** palavras-chave automáticas
   - `EXPORTAR MEUS DADOS` / `BAIXAR MEUS DADOS`
   - `EXCLUIR MEUS DADOS` / `APAGAR MEUS DADOS`
   - `CANCELAR` (dentro de 24h do pedido de exclusão, para desfazer)
2. **E-mail:** privacidade@lembrymed.com.br (resposta humana do Marcus)

Prazo de resposta: **15 dias corridos** (Art. 19).

Implementação técnica:
- `apps/api/src/routes/webhooks/whatsapp.ts` → `handleLgpdDeletionRequest` e `handleLgpdExportRequest`
- Confirmação imediata ao paciente + notificação ao admin via `ADMIN_WHATSAPP`
- Execução real pelo admin via `GET /admin/patients/:id/export` ou `DELETE /admin/patients/:id`

### Dados sensíveis — saúde (Art. 11)

- [x] Base legal declarada (tutela da saúde por profissional de saúde)
- [x] Acesso restrito ao admin (single-admin Marcus, médico)
- [x] Audit log de cada acesso (admin_audit_logs)
- [x] Criptografia at-rest (Neon default AES-256)
- [x] Criptografia em trânsito (TLS 1.2+)
- [x] Retention: texto da conversa anonimizado em 90 dias
- [ ] Criptografia aplicação-level adicional — **gap aceito**. Mitigação: minimização de dados + retention + controle de acesso.

### Segurança (Art. 46)

Medidas técnicas aplicadas (Onda 3 da auditoria):

- [x] `NEXTAUTH_SECRET` obrigatório sem fallback
- [x] Rate limit em /admin/login (5 tent / 15 min)
- [x] Webhook Z-API com token obrigatório em produção + timing-safe compare
- [x] Webhook Stripe com HMAC signature + idempotência Redis
- [x] CORS whitelist
- [x] Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [x] Zod validation em endpoints admin e checkout
- [x] Parameterized queries (Drizzle ORM)
- [x] bcrypt 12 rounds
- [x] Fail-fast de env vars no boot

Medidas administrativas:
- [x] Single-admin (reduz superfície de risco)
- [x] `ADMIN_WHATSAPP` alerta em tempo real eventos críticos
- [x] CI com typecheck + build + testes
- [ ] Treinamento periódico — N/A para equipe unipessoal
- [ ] Auditoria externa — considerar após atingir escala

### Comunicação de incidente (Art. 48)

Procedimento:
1. Detecção (Sentry/monitoramento/admin)
2. Dr. Marcus avalia severidade e escopo
3. Se houver vazamento de dado pessoal com risco relevante, comunicar à **ANPD** em até 2 dias úteis (formato: https://www.gov.br/anpd)
4. Comunicar aos titulares afetados pelos canais cadastrados (WhatsApp + email)
5. Pós-incidente: registrar em `docs/INCIDENTS.md` (ainda por criar)

---

## 3. Subcontratados (operadores)

Todos os fornecedores listados abaixo possuem DPAs (Data Processing Agreements) ou equivalentes:

| Fornecedor    | País | Função                                    | DPA / Base                                   |
|---------------|------|-------------------------------------------|----------------------------------------------|
| Z-API         | BR   | Envio/recebimento WhatsApp                | Termo de uso Z-API (Brasil, LGPD aplicável) |
| Neon          | USA  | Banco de dados                            | Standard Contractual Clauses (SCC)          |
| Railway       | USA  | Hospedagem API                            | SCC + DPA padrão                             |
| Vercel        | USA  | Hospedagem landing/admin                  | SCC + DPA                                    |
| Stripe        | BR/USA | Pagamentos                              | Stripe Data Processing Agreement             |
| Anthropic     | USA  | IA (Claude)                               | Anthropic Commercial Terms + DPA             |
| Cloudflare    | USA  | DNS/CDN (via Vercel)                      | SCC                                          |

Referências:
- Z-API termos: https://z-api.io
- Neon: https://neon.tech/privacy
- Railway: https://railway.com/legal/privacy
- Vercel: https://vercel.com/legal/privacy-policy
- Stripe: https://stripe.com/br/legal/privacy-center
- Anthropic: https://www.anthropic.com/legal/commercial-terms

**Transferência internacional de dados:** todos os DPAs acima contemplam cláusulas-padrão + decisão de adequação (para países EU, GDPR-like) OU mecanismos equivalentes (LGPD Art. 33 IV). Por armazenarmos dados de saúde, a contratação é formalizada.

---

## 4. Política de retenção

| Dado                             | Retenção                                                        | Base                                     |
|----------------------------------|-----------------------------------------------------------------|------------------------------------------|
| Conta ativa (`patients`)         | Enquanto assinatura ativa + 90 dias                             | Necessidade do tratamento                |
| Histórico de confirmações        | Enquanto conta ativa                                            | Cálculo de adesão                        |
| Conversas (`message_logs.content`)| Anonimizadas automaticamente após 90 dias (ver lifecycle worker)| Minimização                              |
| Dados financeiros                | 5 anos                                                          | Obrigação fiscal (Art. 16 II LGPD)       |
| Logs de auditoria admin          | 2 anos                                                          | Evidência legal + reduzir vazamento      |
| Consent logs                     | Indefinidamente enquanto houver conta                           | Obrigação de comprovar consentimento     |
| Conta excluída (pós pedido LGPD) | Dados deletados em até 15 dias                                  | Art. 18 VI + Art. 19                     |

Implementação: `apps/api/src/workers/lifecycle.worker.ts` → retention de message_logs.

---

## 5. Autoridade

Em caso de não atendimento satisfatório, o titular pode reclamar junto à **ANPD (Autoridade Nacional de Proteção de Dados)** em https://www.gov.br/anpd/pt-br.

---

## 6. Revisão desta política

Esta política interna é revisada a cada 12 meses ou sempre que houver:
- Mudança de fornecedor operador
- Introdução de nova categoria de dado coletado
- Incidente de segurança relevante
- Atualização regulatória (ANPD, CFM, ANVISA)

**Próxima revisão prevista:** 2027-04-22.
