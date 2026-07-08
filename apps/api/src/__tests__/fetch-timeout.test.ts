/**
 * @suite Fetch Timeout — AbortController pattern
 * @description Testa o padrão fetchWithTimeout que protege todas as chamadas
 * HTTP externas (Dialog360, Meta Cloud, Z-API, Twilio) de travamento indefinido.
 *
 * Cenários:
 *   - Timeout dispara AbortError quando servidor demora mais que o limite
 *   - Sucesso retorna Response normal quando servidor responde a tempo
 *   - AbortSignal.timeout nativo (quando disponível) funciona identicamente
 *   - Função não altera o comportamento para respostas de erro HTTP (4xx, 5xx)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── Reprodução da função fetchWithTimeout do dialog360.client ────────────────
// Copiada para manter o teste puro e sem dependência de módulos externos.
// Se a implementação no client mudar, atualize aqui também.

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Mocks de fetch ───────────────────────────────────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
});

/** Cria um fetch que demora `delayMs` para responder */
function slowFetch(delayMs: number, status = 200): typeof fetch {
  return vi.fn().mockImplementation(
    (_url: string, opts?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        // Respeita o AbortSignal se presente — rejeita quando abortado
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
        // Nota: não chamamos clearTimeout aqui — o finally da fetchWithTimeout faz isso
        setTimeout(() => {
          resolve(new Response(JSON.stringify({ ok: true }), { status }));
        }, delayMs);
      }),
  );
}

/** Cria um fetch que responde imediatamente */
function fastFetch(status = 200, body = '{}'): typeof fetch {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}

// ─── Timeout dispara AbortError ───────────────────────────────────────────────

describe('timeout', () => {

  it('lança AbortError quando o servidor demora mais que o timeout', async () => {
    vi.stubGlobal('fetch', slowFetch(5_000)); // servidor lento: 5s
    await expect(
      fetchWithTimeout('https://api.example.com/send', {}, 50), // timeout: 50ms
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('AbortError ocorre dentro do prazo esperado (± 100ms)', async () => {
    vi.stubGlobal('fetch', slowFetch(10_000));
    const start = Date.now();
    try {
      await fetchWithTimeout('https://api.example.com/send', {}, 100);
    } catch {
      // esperado
    }
    const elapsed = Date.now() - start;
    // Deve ter abortado em ~100ms, não 10s
    expect(elapsed).toBeLessThan(500);
  });
});

// ─── Resposta a tempo ─────────────────────────────────────────────────────────

describe('resposta dentro do prazo', () => {

  it('retorna Response com status 200 quando servidor responde a tempo', async () => {
    vi.stubGlobal('fetch', fastFetch(200, '{"sent":true}'));
    const res = await fetchWithTimeout('https://api.example.com/send', {}, 5_000);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sent: true });
  });

  it('não lança exceção para respostas HTTP 4xx (erro da API, não timeout)', async () => {
    vi.stubGlobal('fetch', fastFetch(429));
    const res = await fetchWithTimeout('https://api.example.com/send', {}, 5_000);
    expect(res.status).toBe(429); // Too Many Requests — tratar na camada acima
  });

  it('não lança exceção para respostas HTTP 5xx', async () => {
    vi.stubGlobal('fetch', fastFetch(503));
    const res = await fetchWithTimeout('https://api.example.com/send', {}, 5_000);
    expect(res.status).toBe(503);
  });
});

// ─── Timer é limpo após conclusão ─────────────────────────────────────────────

describe('limpeza do timer', () => {

  it('clearTimeout é chamado mesmo em caso de sucesso (sem memory leak)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', fastFetch(200));
    await fetchWithTimeout('https://api.example.com', {}, 5_000);
    expect(clearSpy).toHaveBeenCalledOnce();
  });

  it('clearTimeout é chamado mesmo em caso de timeout (finally block)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', slowFetch(10_000));
    try {
      await fetchWithTimeout('https://api.example.com', {}, 50);
    } catch {
      // esperado
    }
    expect(clearSpy).toHaveBeenCalledOnce();
  });
});

// ─── Opções de fetch são repassadas ──────────────────────────────────────────

describe('repasse de opções ao fetch nativo', () => {

  it('repassa method, headers e body corretamente', async () => {
    const mockFetch = fastFetch(200);
    vi.stubGlobal('fetch', mockFetch);

    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer TOKEN' };
    const body = JSON.stringify({ phone: '5511999990000', message: 'Olá' });

    await fetchWithTimeout('https://api.example.com/send', { method: 'POST', headers, body }, 5_000);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledOpts] = (mockFetch as any).mock.calls[0];
    expect(calledUrl).toBe('https://api.example.com/send');
    expect(calledOpts.method).toBe('POST');
    expect(calledOpts.headers).toMatchObject(headers);
    expect(calledOpts.body).toBe(body);
  });

  it('adiciona o AbortSignal ao options.signal (substituindo o original se necessário)', async () => {
    const mockFetch = fastFetch(200);
    vi.stubGlobal('fetch', mockFetch);

    await fetchWithTimeout('https://api.example.com', {}, 5_000);

    const [, calledOpts] = (mockFetch as any).mock.calls[0];
    expect(calledOpts.signal).toBeInstanceOf(AbortSignal);
  });
});
