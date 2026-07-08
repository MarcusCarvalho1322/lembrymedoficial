# Lembrymed — Briefing para Mentoria de Negócios

**Data:** Abril/2026
**Empresa:** BIZZ.IA (CNPJ em nome de Marcus Carvalho)
**Produto:** Lembrymed — lembretes inteligentes de medicação via WhatsApp
**Estágio:** Produto em produção, operando, ~0 assinantes pagantes, primeiro teste end-to-end concluído nesta semana
**URL pública:** https://lembrymedv-2.vercel.app

---

## 1. O que é, em uma frase

SaaS B2C que envia lembretes de medicamento pelo WhatsApp para idosos e pacientes crônicos brasileiros, com IA que lê receitas por foto ou PDF e avisa um familiar caso o remédio não seja confirmado.

## 2. Problema que resolve

**Estatística-âncora:**
- 50 % dos pacientes crônicos no Brasil não tomam a medicação corretamente (OMS)
- Adesão medicamentosa é um dos maiores causadores de internações evitáveis e mortes por doenças controláveis (hipertensão, diabetes, AVC)

**Dor específica:**
- Idoso esquece → piora do quadro clínico → familiar descobre tarde → hospitalização
- Família mora longe, não consegue vigiar horários
- Apps existentes exigem smartphone moderno + app instalado + notificação ligada — o idoso brasileiro médio não usa isso
- Caixinha organizadora de comprimidos não alerta quando se esquece

**Nossa hipótese:**
WhatsApp é o único canal que o idoso brasileiro **já usa diariamente e checa**. Lembrete vira conversa natural, sem fricção de instalação.

## 3. Quem é o cliente

**Persona primária (comprador ≠ usuário):**
- **Filho(a) adulto (35-55 anos)** que mora em outra cidade ou simplesmente não está com o pai/mãe durante o dia
- Trabalha, tem dinheiro, quer tranquilidade
- Já tentou agenda, post-it na geladeira, alarme no celular do idoso — nada dura
- É quem paga a assinatura

**Persona secundária (usuário):**
- **Idoso (65-85 anos)** com 3-8 medicamentos por dia
- Usa WhatsApp para falar com netos — está confortável com o canal
- Hipertensão, diabetes, colesterol, alzheimer inicial, pós-cirúrgico

**Persona terciária (canal de aquisição potencial):**
- Médico geriatra, clínico, cardiologista
- Farmácia de bairro
- Plano de saúde regional

## 4. Produto — o que EXISTE hoje em produção

### 4.1. Onboarding (cadastro)
1. Cliente entra em lembrymedv-2.vercel.app → clica Assinar
2. Preenche nome, telefone, aceita LGPD → paga no Stripe (R$ 149/ano)
3. Recebe mensagem de boas-vindas no WhatsApp em segundos
4. Conversa com assistente IA (Claude Sonnet) que coleta os medicamentos:
   - Pode **digitar** a lista ("losartana 50 mg às 8 h e 20 h")
   - Pode **mandar foto** da receita — IA lê e extrai os remédios
   - Pode **mandar PDF** (do médico/farmácia) — IA lê e extrai os remédios
5. IA pede os horários faltantes, confirma a lista completa
6. IA pergunta se quer cadastrar um **familiar** (opcional) — nome + WhatsApp
7. Paciente ativado. Fim do onboarding. Geralmente leva 3-5 minutos.

### 4.2. Operação diária (automática)
Para cada horário cadastrado, o sistema envia **três mensagens**:
- **T-30 min:** "Daqui a 30 minutos é hora da Losartana 50 mg. 💊"
- **T-0 min:** "Hora da sua Losartana agora. Já tomou? Responda SIM quando tomar. ✅"
- **T+5 min:** "Tudo bem? Confirmou o remédio das 8 h?" (só se não respondeu SIM ainda)

Se em **30 minutos após o horário** o paciente não confirmar, o **familiar cadastrado recebe** um alerta no WhatsApp: "Seu pai João não confirmou o remédio das 8 h hoje. Pode dar uma olhada?"

### 4.3. Fluxos adicionais
- Paciente responde "troquei meu remédio" → IA reinicia coleta completa e atualiza o banco
- Paciente responde "mudei de familiar" → IA coleta novo contato
- Paciente responde "EXCLUIR MEUS DADOS" ou "EXPORTAR MEUS DADOS" → direitos LGPD acionados automaticamente
- Aviso 30 / 15 / 3 dias antes do vencimento anual para o cliente renovar
- Relatório mensal de adesão enviado ao familiar (% dos medicamentos confirmados no mês)

### 4.4. Admin (backoffice próprio)
Painel em `/admin` para eu operar o negócio:
- Dashboard de KPIs (adesão, mensagens/dia, pacientes ativos)
- MRR, ARR, churn
- Lista de pacientes, ficha individual
- Renovações vencendo
- Monitor da fila de jobs
- Exportação LGPD, deleção de dados

## 5. Modelo de negócio

**Preço atual:** R$ 149,00 / ano — assinatura anual única via Stripe
**Ticket médio:** R$ 149 (plano único)
**MRR projetado por cliente:** R$ 12,42 / mês

**Margem unitária estimada (Capex ≈ 0, só Opex):**
| Item | R$ / ano por paciente |
|---|---|
| Z-API (WhatsApp) — plano Business | ~R$ 100 / mês compartilhado entre todos os pacientes → R$ 12 / paciente / ano (a 100 pacientes) |
| Anthropic (Claude) — tokens de onboarding + update | ~R$ 2 / paciente / ano |
| Neon (Postgres) + Redis + Railway + Vercel | ~R$ 5 / paciente / ano (a 100 pacientes) |
| Stripe (3,99 % + R$ 0,39) | R$ 6,34 |
| **Custo unitário total aprox.** | **R$ 25 / ano** |
| **Margem bruta por paciente** | **R$ 124 / ano (~83 %)** |

**Break-even de infra:** ~15 pacientes pagantes cobrem toda a stack.

## 6. Arquitetura e tech stack

- **Landing/checkout:** Next.js 14 na Vercel
- **API:** Node/Express na Railway (workers BullMQ + ioredis)
- **Banco:** Neon Postgres (Drizzle ORM, migrations versionadas)
- **Fila de mensagens:** BullMQ + Redis
- **WhatsApp:** Z-API (provedor brasileiro, mais barato que Dialog360/Twilio)
- **IA:** Claude Sonnet (conversa) + Claude Haiku (extração JSON estruturada)
- **Pagamento:** Stripe (assinatura anual recorrente)
- **Segurança:** JWT, rate limit, webhook token, LGPD completo, Lighthouse A11y 100/100

**O que diferencia tecnicamente:**
- IA lê receita por foto **ou** PDF (vision + document API) — único no mercado brasileiro
- WhatsApp conversacional (não bot de botão) — sensação de conversar com pessoa
- Timezone 100 % Brasília, dedup de jobs, idempotência — sistema robusto pra escala
- Dashboards de adesão que médicos e familiares podem usar

## 7. Estado atual — verdade nua

- ✅ Produto **tecnicamente pronto e em produção**
- ✅ Primeiro teste end-to-end (eu mesmo) concluído nesta semana
- ✅ Fluxo completo funcionando: checkout → boas-vindas → cadastro por IA → lembretes automáticos → alerta familiar
- ⚠️ **0 clientes pagantes** reais ainda
- ⚠️ **0 campanha de aquisição** rodando
- ⚠️ **Zero validação** de willingness-to-pay em conversa com público-alvo real
- ⚠️ **Zero parcerias** ativas (médicos, farmácias, planos)

## 8. Gargalos que VEJO (e quero crítica honesta do mentor)

### 8.1. Aquisição — GARGALO #1
Não sei como chegar no "filho de 45 anos que cuida do pai idoso". Ideias testadas mentalmente mas não validadas:
- Ads Meta segmentados por interesse em "cuidador de idoso" + faixa etária 35-55
- Parceria com médicos geriatras (comissão ou free trial)
- Distribuição em farmácias de bairro
- Conteúdo SEO em blog ("pai esqueceu remédio", "mãe com alzheimer", etc.)
- Influenciadores segmento saúde/envelhecimento

**Pergunta ao mentor:** qual dessas (ou outra) tem menor CAC e maior conversão esperada?

### 8.2. Pricing — dúvida estratégica
R$ 149/ano = R$ 12,42/mês. Abaixo do ticket de plano pet, acima de um streaming.
- **É barato demais?** Cliente valoriza pouco o que é barato?
- **Deveria ter planos?** R$ 149 (básico) / R$ 249 (com relatório médico PDF mensal) / R$ 399 (com chat 24/7 com enfermeira parceira)?
- **Mensal (R$ 29) vs anual (R$ 149)?** Anual tem churn menor mas fricção maior.

### 8.3. Retenção — o que ainda não existe
- Pacientes podem sumir no meio do mês e eu não tenho playbook de reengajamento
- Não há gamificação (streak de adesão, conquistas)
- Não há comunidade / conteúdo / razão para voltar
- Ao fim do ano, o churn pode ser brutal

### 8.4. Expansão de produto — roadmap incerto
Ideias que tenho mas não sei priorizar:
- **Relatório mensal PDF** (adesão + gráficos) — vale ouro pro médico na consulta, mas custa ~20 h de dev
- **Integração com farmácia** (próximo medicamento próximo do fim → recompra com 1 clique)
- **Chat com enfermeira** (enfermeira terceirizada via call center, respondendo dúvidas triviais)
- **Versão cuidador** (um único cliente gerencia 3-5 pacientes — asilos, casas de repouso)
- **B2B2C com plano de saúde** (plano vende Lembrymed como benefício aos idosos do corpo)
- **Smart watch / tocotrônico** (hardware que dá beep + confirma aperto de botão)

### 8.5. Posicionamento — confuso
Landing hoje vende "nunca mais esqueça seus medicamentos". Mas a pessoa que compra não é quem esquece — é o filho. Deveria vender:
- "Proteja seu pai à distância"
- "Tranquilidade em R$ 0,40/dia"
- "Seu pai não vai mais perder horário"

Diferente copy, diferente funil.

## 9. Perguntas específicas para o mentor

1. **Go-to-market:** qual canal eu deveria testar PRIMEIRO com R$ 2-5 k de budget de aquisição?
2. **Pricing:** R$ 149/ano é subvalor? Testaria outro modelo?
3. **Posicionamento:** vendo "ao idoso" ou "ao filho do idoso"?
4. **Validação:** antes de escalar, o que eu DEVO fazer? (pesquisas, pilot pago, etc.)
5. **Parcerias:** qual tipo de parceria gera volume mais rápido — médicos, farmácias, planos?
6. **Roadmap:** o que é o próximo feature de MAIOR impacto no LTV?
7. **Risco regulatório:** precisa de CRM (Conselho Regional de Medicina)? ANVISA? Precedentes?
8. **Concorrência:** como diferenciar quando surgir concorrente com capital?
9. **Crescimento:** quando começo a contratar? Primeiro SDR? Primeiro CS? Primeiro dev?
10. **Métricas:** quais 3 KPIs eu DEVERIA olhar toda semana?

## 10. O que eu gostaria de sair da mentoria com

- Uma lista priorizada das próximas 3-5 coisas para fazer (não 30)
- Um canal de aquisição validado (ou decisão de pilotar A/B)
- Uma decisão de pricing (mantém R$ 149 ou muda?)
- Referências de players (Brasil ou fora) que fizeram algo parecido
- Um aviso honesto sobre o risco fatal que eu não estou enxergando

---

**Contato do fundador:** Marcus Carvalho — BIZZ.IA
**Assinatura atual:** marcus@bizzia.com.br
