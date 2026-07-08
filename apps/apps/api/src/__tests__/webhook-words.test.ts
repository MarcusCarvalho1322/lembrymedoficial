/**
 * @suite Webhook Response Words — Detecção SIM / NÃO
 * @description Testa a lógica de detecção das palavras-chave SIM/NÃO
 * que determinam se o paciente confirmou ou negou o medicamento.
 *
 * Importância clínica: falso positivo registra confirmação indevida;
 * falso negativo ignora confirmação legítima do paciente.
 *
 * Palavras SIM: SIM, S, SI, YES, 1, TOMEI, TOMEI SIM, JÁ TOMEI, JA TOMEI
 * Palavras NÃO: NÃO, NAO, N, NO, 0, NÃO TOMEI, NAO TOMEI, AINDA NÃO, AINDA NAO
 */

import { describe, it, expect } from 'vitest';

// ─── Reprodução das constantes do whatsapp.ts ─────────────────────────────────
// As constantes são duplicadas aqui para manter o teste puro (sem importar
// o módulo inteiro do webhook que depende de DB, Redis, etc.).
// Se SIM_WORDS / NAO_WORDS mudarem no webhook, este teste deve ser atualizado.

const SIM_WORDS = ['SIM', 'S', 'SI', 'YES', '1', 'TOMEI', 'TOMEI SIM', 'JÁ TOMEI', 'JA TOMEI'];
const NAO_WORDS = ['NÃO', 'NAO', 'N', 'NO', '0', 'NÃO TOMEI', 'NAO TOMEI', 'AINDA NÃO', 'AINDA NAO'];

/** Normalização: trim + uppercase, como o webhook faz antes da comparação */
function normalize(text: string): string {
  return text.trim().toUpperCase();
}

function isSim(text: string): boolean {
  return SIM_WORDS.includes(normalize(text));
}

function isNao(text: string): boolean {
  return NAO_WORDS.includes(normalize(text));
}

// ─── Confirmações SIM ─────────────────────────────────────────────────────────

describe('palavras SIM', () => {

  it.each(SIM_WORDS)('"%s" é reconhecido como SIM', (word) => {
    expect(isSim(word)).toBe(true);
  });

  it('variantes em minúsculo são aceitas após normalização', () => {
    expect(isSim('sim')).toBe(true);
    expect(isSim('tomei')).toBe(true);
    expect(isSim('yes')).toBe(true);
    expect(isSim('já tomei')).toBe(true);
    expect(isSim('ja tomei')).toBe(true);
  });

  it('variantes com espaços extras são aceitas após trim', () => {
    expect(isSim('  SIM  ')).toBe(true);
    expect(isSim(' TOMEI ')).toBe(true);
  });

  it('NÃO é confundido com SIM', () => {
    for (const word of NAO_WORDS) {
      expect(isSim(word)).toBe(false);
    }
  });
});

// ─── Negações NÃO ─────────────────────────────────────────────────────────────

describe('palavras NÃO', () => {

  it.each(NAO_WORDS)('"%s" é reconhecido como NÃO', (word) => {
    expect(isNao(word)).toBe(true);
  });

  it('variantes em minúsculo são aceitas após normalização', () => {
    expect(isNao('não')).toBe(true);
    expect(isNao('nao')).toBe(true);
    expect(isNao('não tomei')).toBe(true);
    expect(isNao('ainda não')).toBe(true);
    expect(isNao('ainda nao')).toBe(true);
  });

  it('variantes com espaços extras são aceitas após trim', () => {
    expect(isNao('  NÃO  ')).toBe(true);
    expect(isNao(' NAO ')).toBe(true);
  });

  it('SIM não é confundido com NÃO', () => {
    for (const word of SIM_WORDS) {
      expect(isNao(word)).toBe(false);
    }
  });
});

// ─── Mensagens ambíguas ou irrelevantes ───────────────────────────────────────

describe('mensagens fora do padrão → nem SIM nem NÃO', () => {

  it.each([
    'oi',
    'obrigado',
    'preciso de ajuda',
    'qual é meu próximo medicamento',
    'quero mudar o remédio',
    '',
    '   ',
    'SIMM',  // erro de digitação com letra extra
    'NAOO',  // erro de digitação
    '11',    // número diferente de 1
    '00',
    'talvez',
    'acho que sim',
    'não sei',
  ])('"%s" não é SIM nem NÃO', (text) => {
    expect(isSim(text)).toBe(false);
    expect(isNao(text)).toBe(false);
  });
});

// ─── Unicidade: sem sobreposição ──────────────────────────────────────────────

describe('integridade do conjunto — sem palavras nas duas listas', () => {

  it('nenhuma palavra aparece em SIM_WORDS e NAO_WORDS simultaneamente', () => {
    const simSet = new Set(SIM_WORDS.map(normalize));
    const naoSet = new Set(NAO_WORDS.map(normalize));
    const intersection = [...simSet].filter(w => naoSet.has(w));
    expect(intersection).toEqual([]);
  });

  it('SIM_WORDS não tem duplicatas internas', () => {
    const normalized = SIM_WORDS.map(normalize);
    const unique = new Set(normalized);
    expect(unique.size).toBe(normalized.length);
  });

  it('NAO_WORDS não tem duplicatas internas', () => {
    const normalized = NAO_WORDS.map(normalize);
    const unique = new Set(normalized);
    expect(unique.size).toBe(normalized.length);
  });
});

// ─── Cobertura de respostas reais de pacientes brasileiros ───────────────────

describe('respostas reais típicas de pacientes', () => {

  it('paciente confirmando com "Tomei sim"', () => {
    expect(isSim('Tomei sim')).toBe(true);
  });

  it('paciente confirmando com "JÁ tomei"', () => {
    expect(isSim('JÁ tomei')).toBe(true);
  });

  it('paciente negando com "Ainda não"', () => {
    expect(isNao('Ainda não')).toBe(true);
  });

  it('paciente negando com "ainda nao" (sem acento)', () => {
    expect(isNao('ainda nao')).toBe(true);
  });

  it('paciente usando "s" minúsculo (confirmação rápida)', () => {
    expect(isSim('s')).toBe(true);
  });

  it('paciente usando "n" minúsculo (negação rápida)', () => {
    expect(isNao('n')).toBe(true);
  });

  it('paciente usando número 1 (teclado numérico)', () => {
    expect(isSim('1')).toBe(true);
  });

  it('paciente usando número 0 (teclado numérico)', () => {
    expect(isNao('0')).toBe(true);
  });
});
