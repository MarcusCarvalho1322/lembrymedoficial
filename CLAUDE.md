# CLAUDE.md — Lembrymed

> Instruções permanentes para o Claude neste repositório. São lidas no início de toda sessão.
> Itens marcados com `[PREENCHER]` devem ser completados na primeira sessão (ver seção 9).

---

## 1. O produto

**Lembrymed** é um SaaS de **lembretes de medicação via WhatsApp**.
O sistema agenda e envia lembretes no horário cadastrado, conversa com o paciente por meio de um agente de IA e registra se ele tomou o medicamento.

**Princípio central:** o Lembrymed **lembra**, não **prescreve**. Ele não é dispositivo de decisão clínica.

---

## 2. Quem conduz o projeto e como se comunicar

- O dono do produto **não é desenvolvedor**. Ele constrói com IA e ferramentas no-code/low-code.
- **Sempre em português do Brasil.**
- Explique cada decisão técnica em linguagem simples: o que é, por que importa e qual o risco de não fazer.
- Mostre especificações e planos **em blocos curtos** e **espere aprovação** antes de avançar de fase.
- Quando houver alternativa no-code/low-code (n8n, Make) mais simples e segura, apresente-a junto da opção em código.
- Nunca diga "pronto" sem **evidência**: saída dos testes, log ou captura.

---

## 3. Stack e arquitetura

| Camada | Tecnologia | Observação |
|---|---|---|
| Painel / front | Next.js na **Vercel** | |
| API e workers | Node.js + **BullMQ** em **VPS com Docker** (`docker-compose.prod.yml`, `Caddyfile`) | Decisão do dono em 04/10/2026. Redis em container Docker na mesma VPS |
| Conversa com o paciente | **Claude Managed Agent** | Arquitetura híbrida: a fila decide **quando** enviar, o agente conduz **a conversa** |
| Banco de dados | **PostgreSQL** em container Docker na VPS | **Nunca usar Supabase**. Migrations em `packages/database/migrations/` |
| WhatsApp | **Z-API** | Ver risco R1 na seção 8 |
| Fuso horário | `America/Sao_Paulo` | Armazenar em UTC e converter só na exibição/agendamento |

**Separação de responsabilidades (não misturar):**

```
PostgreSQL (cadastro: paciente, medicamento, horários, consentimento)
   │
   ▼
BullMQ (agenda e dispara cada lembrete no horário)  ──►  Z-API (envia a mensagem)
                                                            │
                                                            ▼
                                     Claude Managed Agent (interpreta a resposta:
                                     "tomei", "depois", dúvida) → grava no Neon
```

Estrutura de pastas: `[PREENCHER — descrever na primeira sessão]`

---

## 4. Metodologia: Superpowers

Este projeto usa o plugin **Superpowers** como **único** método de desenvolvimento.
**Não** acione skills de outros pacotes de engenharia (agentic-sdlc-kit, zizi-skills, 10x-Team, engineering) para não criar processos concorrentes.

Fluxo obrigatório para qualquer funcionalidade nova:

1. `brainstorming`: perguntas **uma de cada vez**, especificação salva em `docs/specs/`.
2. `using-git-worktrees`: trabalho em branch isolada, nunca direto na `main`.
3. `writing-plans`: tarefas de 2 a 5 minutos, com arquivos exatos e passos de verificação.
4. `subagent-driven-development` + `test-driven-development`: teste falhando primeiro, depois código mínimo.
5. `requesting-code-review` entre tarefas. Problemas críticos bloqueiam o avanço.
6. `verification-before-completion` antes de declarar qualquer coisa concluída.
7. `finishing-a-development-branch`: apresentar as opções (merge / PR / manter / descartar).

Para bugs, use sempre `systematic-debugging`: **causa raiz antes de correção**.

**Escopo:** uma funcionalidade por ciclo. Se o pedido for grande demais, proponha dividi-lo antes de planejar.

---

## 5. Regras não negociáveis

### 5.1 Segurança do paciente
- O agente **nunca** sugere, altera, interpreta ou "corrige" dose, horário, medicamento ou interação medicamentosa.
- Diante de dúvida clínica, sintoma ou efeito adverso, use a **resposta padrão**: orientar o paciente a procurar o médico ou farmacêutico (e, em sinais de urgência, o serviço de emergência). Texto da resposta padrão: `[PREENCHER — aprovado pelo responsável técnico]`.
- O agente não faz diagnóstico nem triagem.
- O conteúdo do lembrete é **exatamente** o que foi cadastrado, sem paráfrase que mude o sentido.
- Toda resposta do agente que fuja do roteiro deve ser registrada para auditoria.

### 5.2 LGPD (Lei nº 13.709/2018)
- Dado referente à saúde é **dado pessoal sensível** (art. 5º, II), e o tratamento exige uma das hipóteses do **art. 11**. Registre o **consentimento** (data, versão do termo, canal) antes do primeiro envio.
- Garanta os **direitos do titular** (art. 18): acesso, correção e **eliminação** a pedido, com fluxo implementado e testado.
- Adote **medidas de segurança** (art. 46): criptografia dos campos de medicação/posologia, acesso mínimo e segregação por cliente.
- **Logs sem dados clínicos em texto aberto**: usar IDs, nunca nome de medicamento ou telefone completo.
- Mantenha um plano de **comunicação de incidente** à ANPD e aos titulares (art. 48): `[PREENCHER — responsável]`.
- Nenhum dado real de paciente em testes, seeds, prints ou commits. Use apenas dados fictícios.

### 5.3 Confiabilidade das filas (BullMQ)
- **Nenhum lembrete perdido, nenhum duplicado.**
- Idempotência: `jobId` determinístico (ex.: `paciente:medicamento:horário-UTC`) para impedir disparo duplo.
- `attempts` + `backoff` exponencial nas falhas de envio, com registro de falha definitiva.
- Tratar **job órfão / travado** quando o worker reinicia (stalled jobs) e testar esse cenário.
- Testar explicitamente: virada de dia, fuso `America/Sao_Paulo`, edição de horário com job já agendado, paciente desativado com jobs pendentes.
- Limitar a taxa de envio (rate limit) para proteger o número de WhatsApp.

### 5.4 WhatsApp
- Toda chamada à Z-API passa por **uma camada de abstração** (ex.: `MessagingProvider`). Nenhum módulo chama a Z-API direto. Isso permite migrar para a API oficial da Meta sem reescrever o sistema (ver R1).
- Respeitar opt-out imediato ("parar", "sair").

### 5.5 Segredos e infraestrutura
- **Nenhuma credencial no código**: tudo em variáveis de ambiente (Vercel / Railway). Atualize o `.env.example` sem valores reais.
- Não executar migrações destrutivas no banco de produção sem aprovação explícita. Teste a migração antes em uma cópia do banco (restaurada de `scripts/backup.sh`).
- Não fazer deploy em produção sem aprovação explícita.

---

## 6. Definição de "pronto"

Uma tarefa só está concluída quando:

- [ ] Testes novos escritos **antes** do código e passando (saída mostrada).
- [ ] Toda a suíte de testes passando.
- [ ] Regras da seção 5 verificadas (segurança do paciente, LGPD, filas).
- [ ] Revisão de código feita, sem pendência crítica.
- [ ] `docs/` atualizado se o comportamento mudou.
- [ ] Resumo em português simples: o que mudou, como testar e que risco permanece.

---

## 7. Convenções

- Commits em português, curtos e no imperativo (ex.: `adiciona reenvio após 30 min sem resposta`).
- Especificações em `docs/specs/AAAA-MM-DD-nome.md`; planos em `docs/plans/`.
- Datas e horários no banco em **UTC**.
- Mensagens ao paciente: linguagem simples, cordial, sem jargão médico, revisadas pelo dono do produto.

---

## 8. Riscos conhecidos

| ID | Risco | Mitigação |
|---|---|---|
| **R1** | Z-API é API **não oficial** (baseada no WhatsApp Web). Um banimento do número interrompe os lembretes. | Camada de abstração (5.4), rate limit, monitorar desconexões, avaliar migração para a WhatsApp Business Platform oficial (Meta), que exige templates aprovados fora da janela de 24h. |
| **R2** | Lembrete não enviado por falha de fila ou worker. | Regras 5.3, alerta quando o envio falha, painel de lembretes pendentes/falhos. |
| **R3** | Agente responder algo clínico. | Regra 5.1, testes com perguntas clínicas provocativas, log de auditoria. |
| **R4** | Vazamento de dado sensível. | Regra 5.2, logs anonimizados, revisão de segurança antes de cada release. |

---

## 9. Primeira sessão: tarefas de configuração

Na primeira sessão com este arquivo, antes de qualquer funcionalidade:

1. Leia `package.json` e a estrutura de pastas e **preencha** a seção 3 (estrutura) e a seção 10 (comandos), **apenas com o que existir no repositório**. Não invente.
2. Liste os `[PREENCHER]` restantes e pergunte ao dono, um de cada vez.
3. Verifique se já existe camada de abstração para a Z-API e testes para as filas. Reporte as lacunas sem corrigir ainda.

---

## 10. Comandos

```
Instalar dependências:  npm ci
Rodar em desenvolvimento: npm run dev:api  |  npm run dev:web
Rodar testes:            npm test
Build do front:          npm run build -w apps/web
Rodar worker local:      [PREENCHER — confirmar com apps/api/src/boot/workers-runner.ts]
Migrações:               SQL em packages/database/migrations/ (aplicar com packages/database/apply-migration.ts)
```