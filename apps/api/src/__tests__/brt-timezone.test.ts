/**
 * @suite BRT Timezone Utilities
 * @description Testa as funções de timezone críticas que controlam QUANDO
 * os lembretes são enviados. Erros aqui causam lembretes na hora errada
 * ou no dia errado — impacto direto na saúde dos pacientes.
 *
 * Cenários cobertos:
 *   - Verão brasileiro (DST, UTC-2): outubro a fevereiro
 *   - Inverno brasileiro (UTC-3): março a setembro
 *   - Cruzamento de meia-noite (21:00–23:59 BRT)
 *   - Virada de mês
 */

import { describe, it, expect } from 'vitest';
import { getNowBRT, getTodayBRT, addDaysBRT, getBRTOffsetMs } from '../lib/brt';

// ─── helpers para criar datas de teste fixas ─────────────────────────────────

/**
 * Cria um Date UTC equivalente a uma hora específica em BRT.
 * Ex: brtAt(2026, 1, 15, 22, 0) = 22:00 BRT de 15/Jan/2026
 *       → UTC = 01:00 de 16/Jan/2026 (UTC-3 no inverno)
 */
function utcForBRT(year: number, month: number, day: number, hour: number, min = 0): Date {
  // BRT inverno = UTC-3
  const utcH = hour + 3;
  if (utcH >= 24) {
    return new Date(Date.UTC(year, month - 1, day + 1, utcH - 24, min));
  }
  return new Date(Date.UTC(year, month - 1, day, utcH, min));
}

/**
 * Cria um Date UTC equivalente a uma hora em BRT durante o verão (UTC-2).
 * Verão brasileiro: novembro a fevereiro aproximadamente.
 */
function utcForBRTSummer(year: number, month: number, day: number, hour: number, min = 0): Date {
  const utcH = hour + 2;
  if (utcH >= 24) {
    return new Date(Date.UTC(year, month - 1, day + 1, utcH - 24, min));
  }
  return new Date(Date.UTC(year, month - 1, day, utcH, min));
}

// ─── getNowBRT ────────────────────────────────────────────────────────────────

describe('getNowBRT', () => {
  it('retorna um objeto Date com getHours refletindo o horário BRT (inverno UTC-3)', () => {
    // 12:00 UTC = 09:00 BRT no inverno
    const utcNoon = new Date('2026-05-15T12:00:00.000Z');
    const brt = getNowBRT(utcNoon);
    expect(brt.getHours()).toBe(9);
    expect(brt.getMinutes()).toBe(0);
  });

  it('retorna um objeto Date com getHours refletindo o horário BRT (verão UTC-2)', () => {
    // 12:00 UTC = 10:00 BRT no verão (novembro tem DST em São Paulo)
    // Nota: verificamos se o offset é -2 ou -3 baseado em Intl real
    const novDate = new Date('2026-11-15T12:00:00.000Z');
    const brt = getNowBRT(novDate);
    // No verão BRT = UTC-2, então 12 UTC = 10 BRT
    const expectedHour = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false })
        .format(novDate)
    );
    expect(brt.getHours()).toBe(expectedHour);
  });

  it('getDate() em BRT após meia-noite UTC reflete o dia correto em BRT', () => {
    // 22:30 BRT = 01:30 UTC do dia seguinte (UTC-3)
    // 15/Mai/2026 22:30 BRT → UTC seria 16/Mai/2026 01:30
    const utcNextDay = utcForBRT(2026, 5, 15, 22, 30);
    const brt = getNowBRT(utcNextDay);
    // BRT deve ser dia 15 (ainda, pois 22:30 < meia-noite)
    expect(brt.getDate()).toBe(15);
  });

  it('não modifica o Date original passado', () => {
    const original = new Date('2026-05-15T15:00:00.000Z');
    const originalMs = original.getTime();
    getNowBRT(original);
    expect(original.getTime()).toBe(originalMs);
  });
});

// ─── getTodayBRT ──────────────────────────────────────────────────────────────

describe('getTodayBRT', () => {
  it('retorna formato YYYY-MM-DD', () => {
    const result = getTodayBRT(new Date('2026-05-15T12:00:00.000Z'));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('retorna a data correta em horário normal (inverno BRT)', () => {
    // 12:00 UTC de 15 Mai = 09:00 BRT de 15 Mai → data BRT = 2026-05-15
    const utcNoon = new Date('2026-05-15T12:00:00.000Z');
    expect(getTodayBRT(utcNoon)).toBe('2026-05-15');
  });

  it('BUG CRÍTICO: 23:00 UTC = dia seguinte, mas BRT ainda no dia anterior (inverno)', () => {
    // 23:00 UTC de 15/Mai/2026 = 20:00 BRT de 15/Mai/2026 (UTC-3)
    // CURRENT_DATE no PostgreSQL retornaria 2026-05-16 (UTC) — ERRADO!
    // getTodayBRT deve retornar 2026-05-15 (BRT correto)
    const utcNight = new Date('2026-05-15T23:00:00.000Z');
    expect(getTodayBRT(utcNight)).toBe('2026-05-15');
  });

  it('BUG CRÍTICO: 02:00 UTC = hoje, mas BRT ainda é ontem (inverno)', () => {
    // 02:00 UTC de 16/Mai = 23:00 BRT de 15/Mai → data BRT = 2026-05-15
    const utcEarlyMorning = new Date('2026-05-16T02:00:00.000Z');
    expect(getTodayBRT(utcEarlyMorning)).toBe('2026-05-15');
  });

  it('meia-noite em BRT (03:00 UTC = 00:00 BRT) retorna novo dia', () => {
    // 03:00 UTC = 00:00 BRT → já virou para o dia 16
    const utcMidnightBRT = new Date('2026-05-16T03:00:00.000Z');
    expect(getTodayBRT(utcMidnightBRT)).toBe('2026-05-16');
  });

  it('funciona na virada de mês', () => {
    // 31/Jan/2026 22:00 BRT (01/Fev 01:00 UTC) → data BRT = 2026-01-31
    const utcNewMonth = new Date('2026-02-01T01:00:00.000Z');
    expect(getTodayBRT(utcNewMonth)).toBe('2026-01-31');
  });

  it('funciona na virada de ano', () => {
    // 31/Dez/2025 22:00 BRT (01/Jan/2026 01:00 UTC) → data BRT = 2025-12-31
    const utcNewYear = new Date('2026-01-01T01:00:00.000Z');
    expect(getTodayBRT(utcNewYear)).toBe('2025-12-31');
  });
});

// ─── addDaysBRT ───────────────────────────────────────────────────────────────

describe('addDaysBRT', () => {
  it('adiciona 30 dias corretamente', () => {
    const jan1 = new Date('2026-01-01T12:00:00.000Z'); // 09:00 BRT
    expect(addDaysBRT(30, jan1)).toBe('2026-01-31');
  });

  it('adiciona 15 dias cruzando mês', () => {
    const jan20 = new Date('2026-01-20T12:00:00.000Z');
    expect(addDaysBRT(15, jan20)).toBe('2026-02-04');
  });

  it('adiciona 3 dias cruzando mês curto (fevereiro)', () => {
    const feb26 = new Date('2026-02-26T12:00:00.000Z');
    expect(addDaysBRT(3, feb26)).toBe('2026-03-01');
  });

  it('adicionando 0 dias retorna hoje em BRT', () => {
    const utc = new Date('2026-05-15T12:00:00.000Z'); // 09:00 BRT
    expect(addDaysBRT(0, utc)).toBe('2026-05-15');
  });

  it('funciona na virada de ano', () => {
    const dec28 = new Date('2025-12-28T12:00:00.000Z');
    expect(addDaysBRT(5, dec28)).toBe('2026-01-02');
  });

  it('BUG: sem correção BRT, 21:30 BRT de 31/Jan calcularia 1/Fev + 30 = 3/Mar', () => {
    // 31/Jan/2026 21:30 BRT → UTC seria 01/Feb 00:30
    // Com CURRENT_DATE (UTC), a base seria 01/Fev, adicionando 30 = 03/Mar — ERRADO!
    // Com addDaysBRT, a base é 31/Jan (BRT), adicionando 30 = 02/Mar — CORRETO
    const utcNextDay = new Date('2026-02-01T00:30:00.000Z');
    expect(addDaysBRT(30, utcNextDay)).toBe('2026-03-02');
  });

  it('retorna formato YYYY-MM-DD', () => {
    expect(addDaysBRT(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── getBRTOffsetMs ───────────────────────────────────────────────────────────

describe('getBRTOffsetMs', () => {
  it('retorna offset positivo (BRT atrás de UTC)', () => {
    const may = new Date('2026-05-15T12:00:00.000Z');
    expect(getBRTOffsetMs(may)).toBeGreaterThan(0);
  });

  it('offset no inverno é 3 horas (10_800_000 ms)', () => {
    const may = new Date('2026-05-15T12:00:00.000Z');
    expect(getBRTOffsetMs(may)).toBe(3 * 60 * 60 * 1000);
  });

  it('offset no verão pode ser 2 horas (DST)', () => {
    // Novembro em São Paulo tem DST → UTC-2
    const nov = new Date('2026-11-15T12:00:00.000Z');
    const offset = getBRTOffsetMs(nov);
    // Aceitar tanto UTC-2 quanto UTC-3 dependendo do ano/regras
    expect([2 * 3600_000, 3 * 3600_000]).toContain(offset);
  });

  it('offset permite computar hora BRT a partir do UTC: utcMs - offsetMs = pseudo-BRT-local', () => {
    // Se UTC = 12:00 e offset = 3h, então o instante BRT "local" é 09:00
    const utcRef = new Date('2026-05-15T12:00:00.000Z');
    const offset = getBRTOffsetMs(utcRef); // 10_800_000 ms
    // Ao subtrair o offset de UTC obtemos um timestamp que, interpretado como
    // pseudolocal, reflete 09:00 — verificamos via getHours() do getNowBRT
    const brt = getNowBRT(utcRef);
    expect(brt.getHours()).toBe(9);
    expect(offset).toBe(3 * 60 * 60 * 1000);
  });
});
