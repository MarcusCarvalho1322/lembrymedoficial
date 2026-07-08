/**
 * @suite Scheduling Windows — Reminder Type Detection
 * @description Testa a lógica crítica de detecção de janelas de tempo
 * que determina QUAL lembrete enviar e QUANDO.
 *
 * Esta é a função mais crítica do sistema: um erro aqui significa que
 * pacientes não recebem lembretes, recebem no momento errado, ou recebem
 * alertas duplicados.
 *
 * Janelas testadas:
 *   T-10 : diffMin ∈ [7, 13]   — aviso 10 min antes
 *   T±0  : diffMin ∈ [-3, 3]   — na hora exata
 *   T+10 : diffMin ∈ [-14, -7] — confirmação pós-medicamento
 *   null : fora das janelas     — não fazer nada
 */

import { describe, it, expect } from 'vitest';
import { getReminderType, calcDiffMinutes, isValidMedTime } from '../lib/scheduling';

// ─── getReminderType ──────────────────────────────────────────────────────────

describe('getReminderType — janelas de tempo', () => {

  // ── T-10 (aviso 10 min antes) ───────────────────────────────────────────
  describe('T-10 window [7, 13]', () => {
    it('diffMin = 7 → t_minus_10 (borda inferior)', () => {
      expect(getReminderType(7)).toBe('t_minus_10');
    });
    it('diffMin = 10 → t_minus_10 (centro)', () => {
      expect(getReminderType(10)).toBe('t_minus_10');
    });
    it('diffMin = 13 → t_minus_10 (borda superior)', () => {
      expect(getReminderType(13)).toBe('t_minus_10');
    });
    it('diffMin = 6.9 → null (abaixo da janela)', () => {
      expect(getReminderType(6.9)).toBeNull();
    });
    it('diffMin = 13.1 → null (acima da janela)', () => {
      expect(getReminderType(13.1)).toBeNull();
    });
  });

  // ── T±0 (na hora exata) ─────────────────────────────────────────────────
  describe('T±0 window [-3, 3]', () => {
    it('diffMin = 0 → t_zero (exatamente na hora)', () => {
      expect(getReminderType(0)).toBe('t_zero');
    });
    it('diffMin = 3 → t_zero (3 min antes ainda)', () => {
      expect(getReminderType(3)).toBe('t_zero');
    });
    it('diffMin = -3 → t_zero (3 min depois ainda)', () => {
      expect(getReminderType(-3)).toBe('t_zero');
    });
    it('diffMin = 3.1 → null (logo acima da janela T±0)', () => {
      expect(getReminderType(3.1)).toBeNull();
    });
    it('diffMin = -3.1 → null (logo abaixo da janela T±0)', () => {
      expect(getReminderType(-3.1)).toBeNull();
    });
  });

  // ── T+10 (confirmação pós-medicamento) ──────────────────────────────────
  describe('T+10 window [-14, -7]', () => {
    it('diffMin = -7 → t_plus_10 (borda superior)', () => {
      expect(getReminderType(-7)).toBe('t_plus_10');
    });
    it('diffMin = -10 → t_plus_10 (centro)', () => {
      expect(getReminderType(-10)).toBe('t_plus_10');
    });
    it('diffMin = -14 → t_plus_10 (borda inferior)', () => {
      expect(getReminderType(-14)).toBe('t_plus_10');
    });
    it('diffMin = -6.9 → null (entre T±0 e T+10)', () => {
      expect(getReminderType(-6.9)).toBeNull();
    });
    it('diffMin = -14.1 → null (abaixo da janela T+10)', () => {
      expect(getReminderType(-14.1)).toBeNull();
    });
  });

  // ── Fora de todas as janelas → null ─────────────────────────────────────
  describe('sem janela ativa', () => {
    it('diffMin = 30 → null (muito cedo)', () => {
      expect(getReminderType(30)).toBeNull();
    });
    it('diffMin = -30 → null (muito tarde)', () => {
      expect(getReminderType(-30)).toBeNull();
    });
    it('diffMin = 100 → null', () => {
      expect(getReminderType(100)).toBeNull();
    });
    it('diffMin = -100 → null', () => {
      expect(getReminderType(-100)).toBeNull();
    });
    it('diffMin entre T±0 e T+10 (-6 a -4) → null (gap intencional)', () => {
      expect(getReminderType(-4)).toBeNull();
      expect(getReminderType(-5)).toBeNull();
      expect(getReminderType(-6)).toBeNull();
    });
    it('diffMin entre T-10 e T±0 (4 a 6) → null (gap intencional)', () => {
      expect(getReminderType(4)).toBeNull();
      expect(getReminderType(5)).toBeNull();
      expect(getReminderType(6)).toBeNull();
    });
  });

  // ── Determinismo: mesmo input → mesmo output ─────────────────────────────
  describe('determinismo', () => {
    it('resultados são determinísticos (sem aleatoriedade)', () => {
      for (let i = 0; i < 100; i++) {
        expect(getReminderType(10)).toBe('t_minus_10');
        expect(getReminderType(0)).toBe('t_zero');
        expect(getReminderType(-10)).toBe('t_plus_10');
        expect(getReminderType(20)).toBeNull();
      }
    });
  });
});

// ─── calcDiffMinutes ─────────────────────────────────────────────────────────

describe('calcDiffMinutes', () => {
  it('retorna positivo quando medicamento é no futuro', () => {
    const nowBRT = new Date();
    nowBRT.setHours(8, 0, 0, 0);
    // med às 08:10 → diffMin = +10
    const diff = calcDiffMinutes(8, 10, nowBRT);
    expect(diff).toBeCloseTo(10, 0);
  });

  it('retorna negativo quando medicamento já passou', () => {
    const nowBRT = new Date();
    nowBRT.setHours(8, 15, 0, 0);
    // med às 08:00 → diffMin = -15
    const diff = calcDiffMinutes(8, 0, nowBRT);
    expect(diff).toBeCloseTo(-15, 0);
  });

  it('retorna 0 quando é exatamente a hora', () => {
    const nowBRT = new Date();
    nowBRT.setHours(14, 30, 0, 0);
    const diff = calcDiffMinutes(14, 30, nowBRT);
    expect(diff).toBeCloseTo(0, 1);
  });

  it('identifica janela T-10 corretamente para med às 08:00 quando são 07:51', () => {
    const nowBRT = new Date();
    nowBRT.setHours(7, 51, 0, 0);
    const diff = calcDiffMinutes(8, 0, nowBRT);
    expect(diff).toBeCloseTo(9, 0);
    expect(getReminderType(diff)).toBe('t_minus_10');
  });

  it('identifica janela T±0 para med às 08:00 quando são 08:01', () => {
    const nowBRT = new Date();
    nowBRT.setHours(8, 1, 0, 0);
    const diff = calcDiffMinutes(8, 0, nowBRT);
    expect(diff).toBeCloseTo(-1, 0);
    expect(getReminderType(diff)).toBe('t_zero');
  });

  it('identifica janela T+10 para med às 08:00 quando são 08:10', () => {
    const nowBRT = new Date();
    nowBRT.setHours(8, 10, 0, 0);
    const diff = calcDiffMinutes(8, 0, nowBRT);
    expect(diff).toBeCloseTo(-10, 0);
    expect(getReminderType(diff)).toBe('t_plus_10');
  });

  it('não dispara nada para med às 08:00 quando são 07:30 (muito cedo)', () => {
    const nowBRT = new Date();
    nowBRT.setHours(7, 30, 0, 0);
    const diff = calcDiffMinutes(8, 0, nowBRT);
    expect(getReminderType(diff)).toBeNull();
  });
});

// ─── isValidMedTime ───────────────────────────────────────────────────────────

describe('isValidMedTime', () => {
  it('aceita horários HH:MM válidos', () => {
    expect(isValidMedTime('07:00')).toBe(true);
    expect(isValidMedTime('12:30')).toBe(true);
    expect(isValidMedTime('21:00')).toBe(true);
    expect(isValidMedTime('00:00')).toBe(true);
    expect(isValidMedTime('23:59')).toBe(true);
  });

  it('aceita horário sem zero à esquerda na hora', () => {
    expect(isValidMedTime('7:00')).toBe(true);
    expect(isValidMedTime('9:30')).toBe(true);
  });

  it('rejeita hora inválida (>23)', () => {
    expect(isValidMedTime('24:00')).toBe(false);
    expect(isValidMedTime('25:00')).toBe(false);
  });

  it('rejeita minuto inválido (>59)', () => {
    expect(isValidMedTime('12:60')).toBe(false);
    expect(isValidMedTime('12:99')).toBe(false);
  });

  it('rejeita formatos inválidos', () => {
    expect(isValidMedTime('')).toBe(false);
    expect(isValidMedTime('7')).toBe(false);
    expect(isValidMedTime('7:0')).toBe(false); // minuto precisa de 2 dígitos
    expect(isValidMedTime('ab:cd')).toBe(false);
    expect(isValidMedTime('7:00:00')).toBe(false);
  });
});
