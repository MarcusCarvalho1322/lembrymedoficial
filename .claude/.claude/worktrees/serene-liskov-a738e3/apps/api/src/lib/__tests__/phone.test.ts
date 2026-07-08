import { describe, it, expect } from 'vitest';
import { buildPhoneCandidates, validateFamilyPhone } from '../phone';

describe('buildPhoneCandidates', () => {
  it('retorna o número original', () => {
    expect(buildPhoneCandidates('5574999999999')).toContain('5574999999999');
  });

  it('adiciona prefixo 55 se ausente', () => {
    expect(buildPhoneCandidates('74999999999')).toContain('5574999999999');
  });

  it('gera variante com 9 inserido para número de 10 dígitos', () => {
    // DDD + 8 dígitos = 10 (cadastro antigo pre-portabilidade)
    const candidates = buildPhoneCandidates('5574999999999'.slice(0, -1)); // 554999999999 = 12 chars: 55+49+8 dígitos = 12
    // cria variante com 9: 55 49 + 9 + últimos 8 = 5549999999999 (13 chars)
    expect(candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('gera variante sem 9 para número de 11 dígitos (cadastro novo)', () => {
    // DDD 74 + 9 + 8 dígitos = 11 → variante sem 9 (10 dígitos depois de 55)
    const candidates = buildPhoneCandidates('5574999999999');
    expect(candidates.some((c) => c === '557499999999')).toBe(true);
  });

  it('não duplica candidatos (Set semantic)', () => {
    const candidates = buildPhoneCandidates('5574999999999');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('lida com telefone vazio sem crash', () => {
    expect(() => buildPhoneCandidates('')).not.toThrow();
  });
});

describe('validateFamilyPhone', () => {
  it('aceita telefone 13 dígitos (55 + DDD + 9 + 8)', () => {
    expect(validateFamilyPhone('5574999999999')).toBe('5574999999999');
  });

  it('aceita telefone 12 dígitos (55 + DDD + 8)', () => {
    expect(validateFamilyPhone('557499999999')).toBe('557499999999');
  });

  it('aceita com máscara — só dígitos sobrevivem', () => {
    expect(validateFamilyPhone('+55 (74) 99999-9999')).toBe('5574999999999');
  });

  it('rejeita telefone sem prefixo 55', () => {
    expect(validateFamilyPhone('74999999999')).toBeNull();
  });

  it('rejeita telefone muito curto', () => {
    expect(validateFamilyPhone('5574')).toBeNull();
  });

  it('rejeita telefone muito longo', () => {
    expect(validateFamilyPhone('55749999999999999')).toBeNull();
  });

  it('rejeita string vazia', () => {
    expect(validateFamilyPhone('')).toBeNull();
  });

  it('rejeita string não-numérica', () => {
    expect(validateFamilyPhone('não tenho')).toBeNull();
  });
});
