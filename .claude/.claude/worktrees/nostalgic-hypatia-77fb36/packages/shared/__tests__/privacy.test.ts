import { describe, it, expect } from 'vitest';
import { maskPhone, maskEmail, maskCpf, maskName } from '../privacy';

describe('maskPhone', () => {
  it('mascara o meio do telefone', () => {
    expect(maskPhone('5511999998888')).toBe('5511****8888');
  });

  it('lida com null/undefined', () => {
    expect(maskPhone(null)).toBe('');
    expect(maskPhone(undefined)).toBe('');
  });

  it('remove não-dígitos antes de mascarar', () => {
    expect(maskPhone('+55 (11) 99999-8888')).toBe('5511****8888');
  });

  it('não quebra em números muito curtos', () => {
    expect(maskPhone('123')).toBe('****');
  });
});

describe('maskEmail', () => {
  it('preserva apenas a primeira letra do local', () => {
    expect(maskEmail('joao.silva@bizzia.com.br')).toBe('j***@bizzia.com.br');
  });

  it('mantém domínio visível', () => {
    expect(maskEmail('marcus@lembrymed.com.br')).toBe('m***@lembrymed.com.br');
  });

  it('lida com null', () => {
    expect(maskEmail(null)).toBe('');
  });
});

describe('maskCpf', () => {
  it('mascara os 6 primeiros dígitos', () => {
    expect(maskCpf('12345678910')).toBe('***.***.789-10');
  });

  it('aceita com máscara', () => {
    expect(maskCpf('123.456.789-10')).toBe('***.***.789-10');
  });

  it('retorna placeholder se tamanho errado', () => {
    expect(maskCpf('1234')).toBe('***');
  });
});

describe('maskName', () => {
  it('mantém primeiro nome + iniciais dos demais', () => {
    expect(maskName('João da Silva')).toBe('João d. S.');
  });

  it('nome único é mascarado parcialmente', () => {
    expect(maskName('Paulo')).toBe('P****');
  });

  it('lida com espaços extras', () => {
    expect(maskName('  Ana  Luiza  Souza  ')).toBe('Ana L. S.');
  });
});
