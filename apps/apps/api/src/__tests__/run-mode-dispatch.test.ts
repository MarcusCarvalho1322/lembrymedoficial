/**
 * @suite RUN_MODE dispatch — Fase 2 (O3.17)
 *
 * Garantias:
 *   - RUN_MODE=api inicia apenas startApiServer
 *   - RUN_MODE=workers inicia apenas startWorkers
 *   - RUN_MODE=all (ou ausente) inicia ambos
 *   - Valor desconhecido cai no fallback 'all' com warning
 *
 * Usa vi.mock para garantir que apenas o lado certo é chamado.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

beforeAll(() => {
  // Env válida para `./config/env` carregar sem matar o processo.
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://test@localhost/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.STRIPE_SECRET_KEY = 'sk_test_aaaaaaaa';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_aaaa';
  process.env.STRIPE_PRICE_ANNUAL = 'price_test_aaaa';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-aaaa';
  process.env.WEB_URL = 'https://example.test';
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
  process.env.NEXTAUTH_SECRET = 'a'.repeat(40);
});

const apiStartMock = vi.fn();
const workersStartMock = vi.fn();

vi.mock('../boot/api-server', () => ({
  startApiServer: apiStartMock,
}));

vi.mock('../boot/workers-runner', () => ({
  startWorkers: workersStartMock,
}));

// Sentry/Anthropic não devem ter side effect nos testes
vi.mock('../config/sentry', () => ({
  bootstrapSentry: vi.fn(),
  getCaptureException: () => () => {},
}));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.RUN_MODE;
  // Reset do module cache para reimportar com o novo RUN_MODE
  vi.resetModules();
});

afterAll(() => {
  delete process.env.RUN_MODE;
});

async function loadEntrypoint() {
  // Importa o module — executa todo o código top-level (incluindo dispatch).
  await import('../index');
}

describe('RUN_MODE dispatch', () => {
  it('RUN_MODE=api → inicia somente API', async () => {
    process.env.RUN_MODE = 'api';
    await loadEntrypoint();
    expect(apiStartMock).toHaveBeenCalledOnce();
    expect(workersStartMock).not.toHaveBeenCalled();
  });

  it('RUN_MODE=workers → inicia somente workers', async () => {
    process.env.RUN_MODE = 'workers';
    await loadEntrypoint();
    expect(workersStartMock).toHaveBeenCalledOnce();
    expect(apiStartMock).not.toHaveBeenCalled();
  });

  it('RUN_MODE=all → inicia ambos', async () => {
    process.env.RUN_MODE = 'all';
    await loadEntrypoint();
    expect(apiStartMock).toHaveBeenCalledOnce();
    expect(workersStartMock).toHaveBeenCalledOnce();
  });

  it('RUN_MODE ausente → fallback "all" (back-compat com deploy legado)', async () => {
    delete process.env.RUN_MODE;
    await loadEntrypoint();
    expect(apiStartMock).toHaveBeenCalledOnce();
    expect(workersStartMock).toHaveBeenCalledOnce();
  });

  it('RUN_MODE desconhecido → fallback "all" (não morre)', async () => {
    process.env.RUN_MODE = 'banana';
    await loadEntrypoint();
    expect(apiStartMock).toHaveBeenCalledOnce();
    expect(workersStartMock).toHaveBeenCalledOnce();
  });

  it('case-insensitive: RUN_MODE=API funciona', async () => {
    process.env.RUN_MODE = 'API';
    await loadEntrypoint();
    expect(apiStartMock).toHaveBeenCalledOnce();
    expect(workersStartMock).not.toHaveBeenCalled();
  });
});
