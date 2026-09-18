/**
 * @suite Scheduler pipeline — integration-style
 *
 * Mocka med-schedule-cache e queues para exercitar runSchedulerTick():
 * seleção de medicamentos ativos, detecção de janela (T-0/T+10),
 * dedup, e enfileiramento com jobId determinístico.
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://test@localhost/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_aaaa';
  process.env.STRIPE_PRICE_ANNUAL = 'price_test_aaaa';
  process.env.DEEPSEEK_API_KEY = 'sk-dummy';
  process.env.WEB_URL = 'https://example.test';
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
  process.env.NEXTAUTH_SECRET = 'a'.repeat(40);
});

// Mocks
const getActiveMedsMock = vi.fn();
const isReminderSentMock = vi.fn();
const queueAddMock = vi.fn();
const queueGetRepeatablesMock = vi.fn(async () => []);
const queueRemoveRepeatableMock = vi.fn();

vi.mock('../lib/med-schedule-cache', () => ({
  getActiveMeds: getActiveMedsMock,
  reminderDedupKey: vi.fn((pid, mid, type, date) => `${pid}-${mid}-${type}-${date}`),
  isReminderAlreadySent: isReminderSentMock,
}));

vi.mock('../config/queues', () => ({
  sendReminderQueue: {
    add: queueAddMock,
    getRepeatableJobs: queueGetRepeatablesMock,
    removeRepeatableByKey: queueRemoveRepeatableMock,
  },
}));

const nowBRTMock = vi.fn();
const todayBRTMock = vi.fn(() => '2026-05-13');
const offsetMsMock = vi.fn(() => 3 * 3_600_000); // BRT = UTC-3
vi.mock('../lib/brt', () => ({
  getNowBRT: () => nowBRTMock(),
  getTodayBRT: () => todayBRTMock(),
  getBRTOffsetMs: () => offsetMsMock(),
}));

async function loadRunTick() {
  const mod = await import('../workers/reminder-scheduler.worker');
  return mod.runSchedulerTick;
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveMedsMock.mockReset();
  isReminderSentMock.mockReset();
  queueAddMock.mockReset();
  isReminderSentMock.mockResolvedValue(false);
});

function brtAt(hour: number, minute: number): Date {
  const d = new Date(Date.UTC(2026, 4, 13, 0, 0, 0));
  d.setHours(hour, minute, 0, 0);
  return d;
}

function medRow(overrides: Record<string, string> = {}) {
  return {
    patient_id: 'p1', patient_name: 'Maria', patient_phone: '5511999999999',
    medication_id: 'm1', med_name: 'Losartana', dosage: '50mg',
    med_time: '08:10',
    ...overrides,
  };
}

describe('runSchedulerTick', () => {
  it('não enfileira T-10 (régua de 2 mensagens — produto)', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 0));
    getActiveMedsMock.mockResolvedValue([medRow()]); // med às 08:10 → diff +10

    const runTick = await loadRunTick();
    const result = await runTick();

    expect(result.enqueued).toBe(0);
    expect(queueAddMock).not.toHaveBeenCalled();
  });

  it('enfileira T-0 (na hora exata)', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 0));
    getActiveMedsMock.mockResolvedValue([medRow({ med_time: '08:00' })]);

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(1);
    expect(queueAddMock.mock.calls[0][1].reminder_type).toBe('t_zero');
  });

  it('enfileira T+10 (10 min depois)', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 10));
    getActiveMedsMock.mockResolvedValue([medRow({ med_time: '08:00' })]);

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(1);
    expect(queueAddMock.mock.calls[0][1].reminder_type).toBe('t_plus_10');
  });

  it('não enfileira fora da janela (35 min antes)', async () => {
    nowBRTMock.mockReturnValue(brtAt(7, 25));
    getActiveMedsMock.mockResolvedValue([medRow({ med_time: '08:00' })]);

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(0);
  });

  it('não enfileira se já enviado hoje (dedup)', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 0));
    getActiveMedsMock.mockResolvedValue([medRow({ med_time: '08:10' })]);
    isReminderSentMock.mockResolvedValue(true);

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(0);
  });

  it('não enfileira medicamento desativado (isActive=false)', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 0));
    getActiveMedsMock.mockResolvedValue([]); // cache só retorna ativos

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(0);
  });

  it('processa múltiplos pacientes/medicamentos em um tick', async () => {
    nowBRTMock.mockReturnValue(brtAt(8, 0));
    getActiveMedsMock.mockResolvedValue([
      { patient_id: 'p1', patient_name: 'A', patient_phone: '5511111111111',
        medication_id: 'm1', med_name: 'X', dosage: '10mg', med_time: '08:00' },
      { patient_id: 'p1', patient_name: 'A', patient_phone: '5511111111111',
        medication_id: 'm2', med_name: 'Y', dosage: '20mg', med_time: '08:00' },
      { patient_id: 'p2', patient_name: 'B', patient_phone: '5522222222222',
        medication_id: 'm3', med_name: 'Z', dosage: '30mg', med_time: '08:00' },
      { patient_id: 'p2', patient_name: 'B', patient_phone: '5522222222222',
        medication_id: 'm4', med_name: 'W', dosage: '40mg', med_time: '09:30' }, // fora da janela
    ]);

    const runTick = await loadRunTick();
    const result = await runTick();
    expect(result.enqueued).toBe(3);
    expect(queueAddMock).toHaveBeenCalledTimes(3);
  });
});
