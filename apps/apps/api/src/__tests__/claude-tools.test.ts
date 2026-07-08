/**
 * @suite Claude Tools — parseClaudeResponse + tool extraction
 *
 * Garantias:
 *  - Texto puro é extraído corretamente
 *  - Tool calls reconhecidas viram ToolCall[]
 *  - Tool names FORA do contexto allowed são descartadas (anti-hallucination)
 *  - extractPhone normaliza para dígitos
 *  - extractName tira whitespace
 */

import { describe, it, expect } from 'vitest';
import {
  parseClaudeResponse,
  findTool,
  extractPhone,
  extractName,
  TOOLS_ONBOARDING,
  TOOLS_FAMILY_UPDATE,
  TOOLS_MED_UPDATE,
  TOOL_TO_MARKER,
  type ToolName,
} from '../routes/webhooks/whatsapp/claude-tools';

// Helper: cria um Anthropic.Message-like com text + tool_use blocks
function makeMessage(blocks: any[]): any {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: blocks,
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

const onboardingAllow: ToolName[] = [
  'confirm_medications',
  'register_family_contact',
  'complete_onboarding',
];

describe('parseClaudeResponse', () => {
  it('extrai texto puro de uma resposta sem tools', () => {
    const msg = makeMessage([{ type: 'text', text: 'Olá, Maria!' }]);
    const parsed = parseClaudeResponse(msg, onboardingAllow);
    expect(parsed.text).toBe('Olá, Maria!');
    expect(parsed.tools).toEqual([]);
  });

  it('concatena múltiplos blocos de texto', () => {
    const msg = makeMessage([
      { type: 'text', text: 'Olá! ' },
      { type: 'text', text: 'Tudo bem?' },
    ]);
    expect(parseClaudeResponse(msg, onboardingAllow).text).toBe('Olá! Tudo bem?');
  });

  it('extrai uma tool_use válida no contexto', () => {
    const msg = makeMessage([
      { type: 'text', text: 'Confirmado!' },
      {
        type: 'tool_use',
        id: 'toolu_1',
        name: 'confirm_medications',
        input: {},
      },
    ]);
    const parsed = parseClaudeResponse(msg, onboardingAllow);
    expect(parsed.text).toBe('Confirmado!');
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].name).toBe('confirm_medications');
    expect(parsed.tools[0].input).toEqual({});
  });

  it('extrai tool_use com input (nome + phone)', () => {
    const msg = makeMessage([
      { type: 'text', text: 'Vou cadastrar.' },
      {
        type: 'tool_use',
        id: 'toolu_2',
        name: 'register_family_contact',
        input: { name: 'João Silva', phone: '5511999999999' },
      },
    ]);
    const parsed = parseClaudeResponse(msg, onboardingAllow);
    expect(parsed.tools[0].input.name).toBe('João Silva');
    expect(parsed.tools[0].input.phone).toBe('5511999999999');
  });

  it('IGNORA tool_use fora do allowlist (anti-hallucination)', () => {
    const msg = makeMessage([
      { type: 'text', text: 'Vou remover.' },
      // remove_family_contact NÃO está no onboardingAllow
      { type: 'tool_use', id: 't', name: 'remove_family_contact', input: {} },
    ]);
    const parsed = parseClaudeResponse(msg, onboardingAllow);
    expect(parsed.tools).toEqual([]);
    expect(parsed.text).toBe('Vou remover.');
  });

  it('aceita tools válidas em contexto family_update', () => {
    const allow: ToolName[] = ['request_family_confirmation', 'register_family_direct', 'remove_family_contact'];
    const msg = makeMessage([
      { type: 'text', text: 'Removendo.' },
      { type: 'tool_use', id: 't', name: 'remove_family_contact', input: {} },
    ]);
    const parsed = parseClaudeResponse(msg, allow);
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools[0].name).toBe('remove_family_contact');
  });

  it('ordem das tools é preservada', () => {
    const msg = makeMessage([
      { type: 'tool_use', id: 't1', name: 'register_family_contact',
        input: { name: 'A', phone: '5511111111111' } },
      { type: 'tool_use', id: 't2', name: 'complete_onboarding', input: {} },
    ]);
    const parsed = parseClaudeResponse(msg, onboardingAllow);
    expect(parsed.tools.map((t) => t.name)).toEqual([
      'register_family_contact',
      'complete_onboarding',
    ]);
  });
});

describe('findTool', () => {
  it('retorna a primeira tool com o nome', () => {
    const parsed = {
      text: '',
      tools: [
        { name: 'register_family_contact' as ToolName, input: { name: 'A', phone: '5511' } },
        { name: 'complete_onboarding'     as ToolName, input: {} },
      ],
    };
    expect(findTool(parsed, 'complete_onboarding')).toBeDefined();
    expect(findTool(parsed, 'register_family_direct')).toBeUndefined();
  });
});

describe('extractPhone', () => {
  it('retorna apenas dígitos', () => {
    expect(extractPhone({ phone: '+55 (11) 99999-9999' })).toBe('5511999999999');
    expect(extractPhone({ phone: '5511999999999' })).toBe('5511999999999');
  });

  it('retorna string vazia se phone ausente', () => {
    expect(extractPhone({})).toBe('');
    expect(extractPhone({ phone: undefined as any })).toBe('');
  });
});

describe('extractName', () => {
  it('trim corretamente', () => {
    expect(extractName({ name: '  João  ' })).toBe('João');
  });
  it('retorna string vazia se name ausente', () => {
    expect(extractName({})).toBe('');
  });
});

describe('TOOL_TO_MARKER mapping', () => {
  it('cobre todas as 7 tools', () => {
    const expected: ToolName[] = [
      'confirm_medications',
      'register_family_contact',
      'complete_onboarding',
      'register_family_direct',
      'request_family_confirmation',
      'remove_family_contact',
      'confirm_medication_update',
    ];
    for (const t of expected) {
      expect(TOOL_TO_MARKER[t]).toBeDefined();
      expect(TOOL_TO_MARKER[t]).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('Tool sets por contexto', () => {
  it('TOOLS_ONBOARDING tem confirm_medications, register_family_contact, complete_onboarding', () => {
    const names = TOOLS_ONBOARDING.map((t) => t.name);
    expect(names).toContain('confirm_medications');
    expect(names).toContain('register_family_contact');
    expect(names).toContain('complete_onboarding');
    expect(names).toHaveLength(3);
  });

  it('TOOLS_MED_UPDATE tem apenas confirm_medication_update', () => {
    expect(TOOLS_MED_UPDATE.map((t) => t.name)).toEqual(['confirm_medication_update']);
  });

  it('TOOLS_FAMILY_UPDATE tem request, direct e remove', () => {
    const names = TOOLS_FAMILY_UPDATE.map((t) => t.name);
    expect(names).toContain('request_family_confirmation');
    expect(names).toContain('register_family_direct');
    expect(names).toContain('remove_family_contact');
    expect(names).toHaveLength(3);
  });
});
