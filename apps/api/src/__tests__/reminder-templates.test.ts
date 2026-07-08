/**
 * @suite Reminder Templates
 * @description Testa os templates de mensagem de lembrete e funções auxiliares.
 *
 * Cobertura:
 *   - REMINDER_TEMPLATES: todos os tipos ativos e legados
 *   - buildReminderMessage: tipo válido, inválido, com/sem horário
 *   - shouldTriggerFamilyAlert: quais tipos acionam alerta familiar
 */

import { describe, it, expect } from 'vitest';
import {
  REMINDER_TEMPLATES,
  buildReminderMessage,
  shouldTriggerFamilyAlert,
} from '../lib/reminder-templates';

// ─── REMINDER_TEMPLATES ───────────────────────────────────────────────────────

describe('REMINDER_TEMPLATES', () => {

  describe('t_minus_10 — aviso 10 min antes', () => {
    it('contém nome e dosagem do medicamento', () => {
      const msg = REMINDER_TEMPLATES.t_minus_10('Metformina', '500mg');
      expect(msg).toContain('Metformina');
      expect(msg).toContain('500mg');
    });

    it('menciona "10 minutos" ou "10 min"', () => {
      const msg = REMINDER_TEMPLATES.t_minus_10('X', '1cp');
      expect(msg.toLowerCase()).toMatch(/10/);
    });

    it('exibe horário quando fornecido', () => {
      const msg = REMINDER_TEMPLATES.t_minus_10('Losartana', '50mg', '08:00');
      expect(msg).toContain('08:00');
    });

    it('não quebra quando horário é undefined', () => {
      expect(() => REMINDER_TEMPLATES.t_minus_10('Omeprazol', '20mg')).not.toThrow();
      const msg = REMINDER_TEMPLATES.t_minus_10('Omeprazol', '20mg');
      expect(msg).toContain('Omeprazol');
    });
  });

  describe('t_zero — na hora exata', () => {
    it('contém nome e dosagem', () => {
      const msg = REMINDER_TEMPLATES.t_zero('Atorvastatina', '20mg');
      expect(msg).toContain('Atorvastatina');
      expect(msg).toContain('20mg');
    });

    it('menciona "hora" (é a hora do medicamento)', () => {
      const msg = REMINDER_TEMPLATES.t_zero('X', '1cp');
      expect(msg.toLowerCase()).toContain('hora');
    });

    it('exibe horário no formato "São HH:MM" quando fornecido', () => {
      const msg = REMINDER_TEMPLATES.t_zero('Metformina', '850mg', '12:00');
      expect(msg).toContain('12:00');
    });

    it('funciona sem horário', () => {
      const msg = REMINDER_TEMPLATES.t_zero('Metformina', '850mg');
      expect(msg).toContain('Metformina');
    });
  });

  describe('t_plus_10 — confirmação pós-medicamento', () => {
    it('contém nome e dosagem', () => {
      const msg = REMINDER_TEMPLATES.t_plus_10('Insulina', '10UI');
      expect(msg).toContain('Insulina');
      expect(msg).toContain('10UI');
    });

    it('pede confirmação SIM ou NÃO', () => {
      const msg = REMINDER_TEMPLATES.t_plus_10('X', '1cp');
      expect(msg.toUpperCase()).toMatch(/SIM|NÃO|NAO/);
    });
  });

  describe('t_minus_30 — legado MVP v1', () => {
    it('existe e funciona (retrocompatibilidade)', () => {
      const fn = REMINDER_TEMPLATES.t_minus_30;
      expect(typeof fn).toBe('function');
      const msg = fn('Amoxicilina', '500mg');
      expect(msg).toContain('Amoxicilina');
      expect(msg).toContain('30');
    });
  });

  describe('t_minus_5 — legado MVP v1', () => {
    it('existe e funciona', () => {
      const fn = REMINDER_TEMPLATES.t_minus_5;
      expect(typeof fn).toBe('function');
      const msg = fn('Paracetamol', '750mg');
      expect(msg).toContain('Paracetamol');
    });
  });

  describe('t_plus_5 — legado MVP v1', () => {
    it('existe e pede confirmação', () => {
      const fn = REMINDER_TEMPLATES.t_plus_5;
      expect(typeof fn).toBe('function');
      const msg = fn('Dipirona', '1g');
      expect(msg.toUpperCase()).toMatch(/SIM|NÃO|NAO/);
    });
  });
});

// ─── buildReminderMessage ─────────────────────────────────────────────────────

describe('buildReminderMessage', () => {

  it('retorna mensagem t_minus_10 com nome, dosagem e horário', () => {
    const msg = buildReminderMessage('t_minus_10', 'Metformina', '500mg', '08:00');
    expect(msg).toContain('Metformina');
    expect(msg).toContain('500mg');
    expect(msg).toContain('08:00');
  });

  it('retorna mensagem t_zero com nome e dosagem', () => {
    const msg = buildReminderMessage('t_zero', 'Losartana', '50mg', '20:00');
    expect(msg).toContain('Losartana');
    expect(msg).toContain('50mg');
  });

  it('retorna mensagem t_plus_10 (sem horário)', () => {
    const msg = buildReminderMessage('t_plus_10', 'Insulina', '10UI');
    expect(msg).toContain('Insulina');
    expect(msg.toUpperCase()).toMatch(/SIM|NÃO|NAO/);
  });

  it('retorna fallback para tipo desconhecido', () => {
    const msg = buildReminderMessage('tipo_invalido', 'Vitamina C', '1g');
    expect(msg).toContain('Vitamina C');
    expect(msg).toContain('1g');
    // Fallback deve mencionar "Lembrete" ou "verifique"
    expect(msg.toLowerCase()).toMatch(/lembrete|verifique/);
  });

  it('retorna fallback para string vazia', () => {
    const msg = buildReminderMessage('', 'Aspirina', '100mg');
    expect(msg).toContain('Aspirina');
  });

  it('retorna mensagem legada t_minus_30 (jobs em voo no Redis)', () => {
    const msg = buildReminderMessage('t_minus_30', 'Omeprazol', '20mg');
    expect(msg).toContain('Omeprazol');
    expect(msg).not.toMatch(/verifique seus medicamentos/);
  });

  it('retorna mensagem legada t_plus_5', () => {
    const msg = buildReminderMessage('t_plus_5', 'Paracetamol', '750mg');
    expect(msg.toUpperCase()).toMatch(/SIM|NÃO|NAO/);
  });

  it('não lança exceção para qualquer combinação de inputs', () => {
    const types = ['t_minus_10', 't_zero', 't_plus_10', 't_minus_30', 't_minus_5', 't_plus_5', 'desconhecido', ''];
    for (const t of types) {
      expect(() => buildReminderMessage(t, 'Medicamento X', '10mg', '09:00')).not.toThrow();
    }
  });

  it('é determinístico — mesmo input retorna mesmo output', () => {
    for (let i = 0; i < 50; i++) {
      const a = buildReminderMessage('t_minus_10', 'Metformina', '500mg', '08:00');
      const b = buildReminderMessage('t_minus_10', 'Metformina', '500mg', '08:00');
      expect(a).toBe(b);
    }
  });
});

// ─── shouldTriggerFamilyAlert ─────────────────────────────────────────────────

describe('shouldTriggerFamilyAlert', () => {

  it('t_plus_10 deve acionar alerta familiar (tipo ativo)', () => {
    expect(shouldTriggerFamilyAlert('t_plus_10')).toBe(true);
  });

  it('t_plus_5 deve acionar alerta familiar (tipo legado)', () => {
    expect(shouldTriggerFamilyAlert('t_plus_5')).toBe(true);
  });

  it('t_minus_10 NÃO deve acionar alerta familiar', () => {
    expect(shouldTriggerFamilyAlert('t_minus_10')).toBe(false);
  });

  it('t_zero NÃO deve acionar alerta familiar', () => {
    expect(shouldTriggerFamilyAlert('t_zero')).toBe(false);
  });

  it('t_minus_30 NÃO deve acionar alerta familiar', () => {
    expect(shouldTriggerFamilyAlert('t_minus_30')).toBe(false);
  });

  it('t_minus_5 NÃO deve acionar alerta familiar', () => {
    expect(shouldTriggerFamilyAlert('t_minus_5')).toBe(false);
  });

  it('tipo desconhecido NÃO deve acionar alerta', () => {
    expect(shouldTriggerFamilyAlert('tipo_invalido')).toBe(false);
    expect(shouldTriggerFamilyAlert('')).toBe(false);
  });
});
