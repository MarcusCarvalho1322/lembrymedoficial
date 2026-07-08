/**
 * @module Webhook WhatsApp — Tool definitions para o Anthropic SDK
 *
 * Substituiu os marcadores textuais [X:y] por tool use (Onda 3.16).
 * Vantagens:
 *   - SDK valida o input_schema (não precisa parsear regex frágil).
 *   - Robusto contra prompt injection que tente escrever marcadores no texto.
 *   - Tipagem forte em TypeScript via inferência de Zod equivalente.
 *
 * Mantemos validateMarker (lib/marker-validation) como camada SEMÂNTICA
 * adicional — formato OK não significa intenção real do paciente.
 */

import type Anthropic from '@anthropic-ai/sdk';

/** Tools disponíveis em qualquer flow (validadas por contexto). */
export type ToolName =
  | 'confirm_medications'           // [MEDICAMENTOS_CONFIRMADOS]
  | 'register_family_contact'       // [FAMILIAR_CONFIRMADO] (onboarding)
  | 'complete_onboarding'           // [ONBOARDING_COMPLETO]
  | 'register_family_direct'        // [FAMILIAR_DIRETO]
  | 'request_family_confirmation'   // [SOLICITAR_CONFIRMACAO_FAMILIAR]
  | 'remove_family_contact'         // [REMOVER_FAMILIAR]
  | 'confirm_medication_update';    // [MED_UPDATE_CONFIRMADO]

/** Mapa de marker → ToolName (usado por validateMarker). */
export const TOOL_TO_MARKER: Record<ToolName,
  'MEDICAMENTOS_CONFIRMADOS' | 'FAMILIAR_CONFIRMADO' | 'ONBOARDING_COMPLETO'
  | 'FAMILIAR_DIRETO' | 'SOLICITAR_CONFIRMACAO_FAMILIAR' | 'REMOVER_FAMILIAR'
  | 'MED_UPDATE_CONFIRMADO'> = {
  confirm_medications:         'MEDICAMENTOS_CONFIRMADOS',
  register_family_contact:     'FAMILIAR_CONFIRMADO',
  complete_onboarding:         'ONBOARDING_COMPLETO',
  register_family_direct:      'FAMILIAR_DIRETO',
  request_family_confirmation: 'SOLICITAR_CONFIRMACAO_FAMILIAR',
  remove_family_contact:       'REMOVER_FAMILIAR',
  confirm_medication_update:   'MED_UPDATE_CONFIRMADO',
};

/** Schema JSON do telefone brasileiro (E.164). */
const phoneProp = {
  type: 'string' as const,
  description:
    'Telefone do familiar em formato 55 + DDD + número (ex: 5511999999999). Apenas dígitos.',
  pattern: '^55\\d{10,11}$',
};

const nameProp = {
  type: 'string' as const,
  description: 'Nome do familiar (mínimo 2 caracteres, máximo 120).',
  minLength: 2,
  maxLength: 120,
};

// ═══════════════════════════════════════════════════════════
// Definições de tools
// ═══════════════════════════════════════════════════════════

const TOOL_DEFS: Record<ToolName, Anthropic.Tool> = {
  confirm_medications: {
    name: 'confirm_medications',
    description:
      'Chame quando o paciente confirmar EXPLICITAMENTE a lista completa de medicamentos ' +
      '(com horários de TODOS). NUNCA chame sem ter os horários completos.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  register_family_contact: {
    name: 'register_family_contact',
    description:
      'Chame durante o ONBOARDING quando o paciente fornecer nome E telefone do familiar e ' +
      'confirmar o cadastro. NUNCA use com o número do próprio paciente.',
    input_schema: {
      type: 'object',
      properties: { name: nameProp, phone: phoneProp },
      required: ['name', 'phone'],
    },
  },

  complete_onboarding: {
    name: 'complete_onboarding',
    description:
      'Chame APÓS ter coletado medicamentos (e familiar opcional) para ativar o paciente. ' +
      'Pode ser chamada na mesma resposta que register_family_contact ou sozinha (se o paciente ' +
      'recusou cadastrar familiar).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  register_family_direct: {
    name: 'register_family_direct',
    description:
      'Chame APENAS quando o paciente já cadastrado exercer autonomia explícita (LGPD Art. 18) ' +
      'sobre cadastrar familiar sem esperar confirmação do familiar. Exige insistência clara do ' +
      'paciente ("insisto", "cadastra direto", "não precisa confirmar com ele"). NUNCA use com ' +
      'o número do próprio paciente.',
    input_schema: {
      type: 'object',
      properties: { name: nameProp, phone: phoneProp },
      required: ['name', 'phone'],
    },
  },

  request_family_confirmation: {
    name: 'request_family_confirmation',
    description:
      'Fluxo PADRÃO de cadastro de familiar para paciente ATIVO: envia mensagem ao familiar ' +
      'pedindo SIM/NÃO. Chame quando o paciente fornecer nome + telefone e confirmar. NUNCA ' +
      'use com o número do próprio paciente.',
    input_schema: {
      type: 'object',
      properties: { name: nameProp, phone: phoneProp },
      required: ['name', 'phone'],
    },
  },

  remove_family_contact: {
    name: 'remove_family_contact',
    description:
      'Chame APENAS quando o paciente expressar intenção CLARA de remover o contato familiar ' +
      'cadastrado (ex: "quero remover", "pode tirar", "não quero mais familiar"). Confirme antes.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  confirm_medication_update: {
    name: 'confirm_medication_update',
    description:
      'Chame APENAS quando o paciente confirmar EXPLICITAMENTE a nova lista completa de ' +
      'medicamentos durante um fluxo de atualização. Confirmação precisa ser inequívoca ("sim, ' +
      'confirmo", "está correto", "pode salvar").',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
};

export function getTool(name: ToolName): Anthropic.Tool {
  return TOOL_DEFS[name];
}

/** Conjuntos de tools por contexto. */
export const TOOLS_ONBOARDING: Anthropic.Tool[] = [
  TOOL_DEFS.confirm_medications,
  TOOL_DEFS.register_family_contact,
  TOOL_DEFS.complete_onboarding,
];

export const TOOLS_MED_UPDATE: Anthropic.Tool[] = [
  TOOL_DEFS.confirm_medication_update,
];

export const TOOLS_FAMILY_UPDATE: Anthropic.Tool[] = [
  TOOL_DEFS.request_family_confirmation,
  TOOL_DEFS.register_family_direct,
  TOOL_DEFS.remove_family_contact,
];

// ═══════════════════════════════════════════════════════════
// Helpers para processar a resposta
// ═══════════════════════════════════════════════════════════

export interface ToolCall {
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ParsedResponse {
  /** Texto destinado ao paciente (concatenação dos blocos de texto). */
  text: string;
  /** Tool calls emitidas pelo modelo, na ordem. */
  tools: ToolCall[];
}

/**
 * Lê uma resposta do Anthropic SDK e extrai o texto + tool calls.
 * Filtra apenas tool names conhecidas (defesa contra hallucination).
 */
export function parseClaudeResponse(
  response: Anthropic.Message,
  allowedTools: readonly ToolName[],
): ParsedResponse {
  const textParts: string[] = [];
  const tools: ToolCall[] = [];
  const allowSet = new Set<string>(allowedTools);

  for (const block of response.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      if (!allowSet.has(block.name)) {
        // hallucination — modelo inventou uma tool fora do contexto
        continue;
      }
      tools.push({
        name: block.name as ToolName,
        input: (block.input as Record<string, unknown>) || {},
      });
    }
  }

  return { text: textParts.join('').trim(), tools };
}

/** Retorna a primeira tool call do nome dado (ou undefined). */
export function findTool(parsed: ParsedResponse, name: ToolName): ToolCall | undefined {
  return parsed.tools.find((t) => t.name === name);
}

/** Sanitiza phone para dígitos. */
export function extractPhone(input: Record<string, unknown>): string {
  const raw = String(input.phone ?? '');
  return raw.replace(/\D/g, '');
}

/** Sanitiza name (trim). */
export function extractName(input: Record<string, unknown>): string {
  return String(input.name ?? '').trim();
}
