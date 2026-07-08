# _legacy — Arquivos do Managed Agent SDK (v1)

Estes arquivos fazem parte da arquitetura original do Lembrymed que usava
o **Anthropic Managed Agent SDK** com ferramentas customizadas (`send_whatsapp`,
`save_medications`, etc.).

A arquitetura foi substituída na **v2.x** por uma abordagem mais simples e
confiável: **Claude messages.create** diretamente (sem Managed Agent) com
marcadores textuais (`[MEDICAMENTOS_CONFIRMADOS]`, `[ONBOARDING_COMPLETO]`, etc.).

## Arquivos

| Arquivo | Propósito original |
|---|---|
| `ai.service.ts` | Gerenciava sessões do Managed Agent Anthropic |
| `tool-executor.service.ts` | Executava as 6 ferramentas customizadas do agente |
| `session-stream.service.ts` | Processava o stream SSE do Managed Agent |
| `onboarding.prompt.ts` | System prompt do agente de onboarding (v1) |
| `extraction.prompt.ts` | Prompt de extração de medicamentos (v1) |
| `onboarding.tools.ts` | Definição das 6 ferramentas customizadas (v1) |

## Por que foram mantidos?

Para referência histórica e documentação da evolução da arquitetura.
Nenhum arquivo ativo os importa — podem ser deletados com segurança
se o repositório precisar ser limpo definitivamente.
