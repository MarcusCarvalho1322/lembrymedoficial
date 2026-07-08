/**
 * @suite Report Builder — Relatório Mensal de Adesão
 * @description Testa a geração do texto do relatório mensal de medicamentos.
 *
 * Cenários cobertos:
 *   - Cálculo de percentual de adesão e medalha
 *   - Barra de progresso (▓░)
 *   - Versão para paciente vs familiar
 *   - Casos extremos: 0%, 100%, sem doses, sem resposta, múltiplos medicamentos
 */

import { describe, it, expect } from 'vitest';
import { buildMonthlyReportText, type MedReport } from '../lib/report-builder';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const singleMedFull: MedReport = {
  name: 'Metformina',
  dosage: '500mg',
  totalDoses: 30,
  confirmed: 30,
  denied: 0,
  noResponse: 0,
};

const singleMedPartial: MedReport = {
  name: 'Losartana',
  dosage: '50mg',
  totalDoses: 30,
  confirmed: 24,
  denied: 3,
  noResponse: 3,
};

const singleMedZero: MedReport = {
  name: 'Omeprazol',
  dosage: '20mg',
  totalDoses: 30,
  confirmed: 0,
  denied: 15,
  noResponse: 15,
};

// ─── Aderência e Medalha ──────────────────────────────────────────────────────

describe('cálculo de adesão e medalha', () => {

  it('100% de adesão → Excelente 🏆', () => {
    const text = buildMonthlyReportText('João Silva', 'Janeiro/2026', [singleMedFull], false);
    expect(text).toContain('100%');
    expect(text).toContain('Excelente');
  });

  it('80% de adesão → Boa ✅', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 10, confirmed: 8, denied: 1, noResponse: 1 };
    const text = buildMonthlyReportText('Maria', 'Fevereiro/2026', [med], false);
    expect(text).toContain('80%');
    expect(text).toContain('Boa');
  });

  it('60% de adesão → Regular ⚠️', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 10, confirmed: 6, denied: 2, noResponse: 2 };
    const text = buildMonthlyReportText('Pedro', 'Março/2026', [med], false);
    expect(text).toContain('60%');
    expect(text).toContain('Regular');
  });

  it('0% de adesão → Baixa ❌', () => {
    const text = buildMonthlyReportText('Ana', 'Abril/2026', [singleMedZero], false);
    expect(text).toContain('0%');
    expect(text).toContain('Baixa');
  });

  it('0 doses totais → 0% sem divisão por zero', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 0, confirmed: 0, denied: 0, noResponse: 0 };
    expect(() => buildMonthlyReportText('Teste', 'Maio/2026', [med], false)).not.toThrow();
    const text = buildMonthlyReportText('Teste', 'Maio/2026', [med], false);
    expect(text).toContain('0%');
  });

  it('90% exato → Excelente (borda da medalha)', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 10, confirmed: 9, denied: 1, noResponse: 0 };
    const text = buildMonthlyReportText('Teste', 'Junho/2026', [med], false);
    expect(text).toContain('90%');
    expect(text).toContain('Excelente');
  });

  it('75% exato → Boa (borda da medalha)', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 4, confirmed: 3, denied: 1, noResponse: 0 };
    const text = buildMonthlyReportText('Teste', 'Julho/2026', [med], false);
    expect(text).toContain('75%');
    expect(text).toContain('Boa');
  });

  it('adesão geral é calculada sobre o total de todos os medicamentos', () => {
    const med1: MedReport = { name: 'Med A', dosage: '1cp', totalDoses: 10, confirmed: 10, denied: 0, noResponse: 0 };
    const med2: MedReport = { name: 'Med B', dosage: '1cp', totalDoses: 10, confirmed: 0,  denied: 10, noResponse: 0 };
    // Total: 10/20 = 50%
    const text = buildMonthlyReportText('Teste', 'Agosto/2026', [med1, med2], false);
    expect(text).toContain('50%');
    expect(text).toContain('Regular');
  });
});

// ─── Barra de Progresso ───────────────────────────────────────────────────────

describe('barra de progresso ▓░', () => {

  it('100% → barra completamente cheia (10 ▓)', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(text).toContain('▓▓▓▓▓▓▓▓▓▓');
  });

  it('0% → barra completamente vazia (10 ░)', () => {
    const text = buildMonthlyReportText('Ana', 'Jan/2026', [singleMedZero], false);
    expect(text).toContain('░░░░░░░░░░');
  });

  it('80% → 8 ▓ + 2 ░', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 10, confirmed: 8, denied: 1, noResponse: 1 };
    const text = buildMonthlyReportText('Teste', 'Jan/2026', [med], false);
    expect(text).toContain('▓▓▓▓▓▓▓▓░░');
  });

  it('50% → 5 ▓ + 5 ░', () => {
    const med: MedReport = { name: 'X', dosage: '1cp', totalDoses: 10, confirmed: 5, denied: 5, noResponse: 0 };
    const text = buildMonthlyReportText('Teste', 'Jan/2026', [med], false);
    expect(text).toContain('▓▓▓▓▓░░░░░');
  });
});

// ─── Versão Paciente ──────────────────────────────────────────────────────────

describe('versão para paciente (forFamily = false)', () => {

  it('usa o primeiro nome do paciente', () => {
    const text = buildMonthlyReportText('Maria Clara Santos', 'Jan/2026', [singleMedFull], false);
    expect(text).toContain('Maria');
    // Sobrenome não precisa aparecer no header
  });

  it('contém o período do relatório', () => {
    const text = buildMonthlyReportText('João', 'Março/2026', [singleMedFull], false);
    expect(text).toContain('Março/2026');
  });

  it('menciona mostrar ao médico', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(text.toLowerCase()).toMatch(/m[eé]dico/);
  });

  it('NÃO usa nome do familiar quando forFamily = false', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false, 'Familiar Teste');
    expect(text).not.toContain('Familiar Teste');
  });
});

// ─── Versão Familiar ──────────────────────────────────────────────────────────

describe('versão para familiar (forFamily = true)', () => {

  it('inclui o nome do paciente completo no cabeçalho', () => {
    const text = buildMonthlyReportText('Carlos Eduardo Souza', 'Jan/2026', [singleMedFull], true, 'Ana Lima');
    expect(text).toContain('Carlos Eduardo Souza');
  });

  it('inclui o nome do familiar', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], true, 'Maria Lima');
    expect(text).toContain('Maria Lima');
  });

  it('menciona levar ao médico do paciente', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], true, 'Ana');
    expect(text.toLowerCase()).toMatch(/m[eé]dico/);
  });

  it('funciona sem familyName (forFamily = false por default)', () => {
    expect(() =>
      buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false)
    ).not.toThrow();
  });
});

// ─── Detalhes por Medicamento ─────────────────────────────────────────────────

describe('detalhes por medicamento', () => {

  it('exibe nome e dosagem de cada medicamento', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedPartial], false);
    expect(text).toContain('Losartana');
    expect(text).toContain('50mg');
  });

  it('exibe doses confirmadas / total', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedPartial], false);
    // 24/30 confirmadas
    expect(text).toContain('24');
    expect(text).toContain('30');
  });

  it('exibe doses negadas quando > 0', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedPartial], false);
    expect(text).toContain('3'); // denied = 3
    expect(text.toLowerCase()).toMatch(/não tomad|nao tomad/);
  });

  it('exibe sem resposta quando > 0', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedPartial], false);
    expect(text.toLowerCase()).toMatch(/sem resposta/);
  });

  it('omite linha "Não tomadas" quando denied = 0', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(text.toLowerCase()).not.toMatch(/não tomad|nao tomad/);
  });

  it('omite linha "Sem resposta" quando noResponse = 0', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(text.toLowerCase()).not.toMatch(/sem resposta/);
  });

  it('exibe todos os medicamentos quando há múltiplos', () => {
    const meds: MedReport[] = [
      { name: 'Metformina', dosage: '500mg', totalDoses: 30, confirmed: 28, denied: 1, noResponse: 1 },
      { name: 'Losartana',  dosage: '50mg',  totalDoses: 30, confirmed: 25, denied: 3, noResponse: 2 },
      { name: 'Omeprazol',  dosage: '20mg',  totalDoses: 30, confirmed: 30, denied: 0, noResponse: 0 },
    ];
    const text = buildMonthlyReportText('João', 'Jan/2026', meds, false);
    expect(text).toContain('Metformina');
    expect(text).toContain('Losartana');
    expect(text).toContain('Omeprazol');
  });
});

// ─── Estrutura e Formato ──────────────────────────────────────────────────────

describe('estrutura e formato do texto', () => {

  it('retorna uma string não vazia', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(50);
  });

  it('contém emoji de relatório 📋', () => {
    const text = buildMonthlyReportText('João', 'Jan/2026', [singleMedFull], false);
    expect(text).toContain('📋');
  });

  it('contém emoji de pílula 💊 para cada medicamento', () => {
    const meds = [singleMedFull, singleMedPartial];
    const text = buildMonthlyReportText('João', 'Jan/2026', meds, false);
    const pillCount = (text.match(/💊/g) || []).length;
    expect(pillCount).toBeGreaterThanOrEqual(2);
  });

  it('é determinístico — mesma entrada sempre gera mesma saída', () => {
    const args: [string, string, MedReport[], boolean] = ['João Silva', 'Janeiro/2026', [singleMedPartial], false];
    const first  = buildMonthlyReportText(...args);
    const second = buildMonthlyReportText(...args);
    expect(first).toBe(second);
  });
});
