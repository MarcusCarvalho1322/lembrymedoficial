/**
 * @suite Auth Middleware — requireAdmin guard
 *
 * Cobre:
 *  - Header Authorization válido/inválido
 *  - Cookie httpOnly válido/inválido
 *  - CSRF guard (request mutante via cookie sem X-Requested-With)
 *  - Bypass de rotas /login e /logout
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// O env precisa ser válido para o módulo carregar — setamos antes do import.
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgres://test@localhost/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.STRIPE_SECRET_KEY = 'sk_test_aaaaaaaaaaaa';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_aaaa';
  process.env.STRIPE_PRICE_ANNUAL = 'price_test_aaaa';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-aaaa';
  process.env.WEB_URL = 'https://example.test';
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD_HASH = '$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
  process.env.NEXTAUTH_SECRET = 'a'.repeat(40);
});

interface MockReq {
  url: string;
  method: string;
  headers: Record<string, string | undefined>;
  ip?: string;
}

function makeReq(overrides: Partial<MockReq> = {}): Request & { admin?: any } {
  return {
    url: '/dashboard',
    method: 'GET',
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  } as any;
}

function makeRes(): Response & { _status: number; _body: any; _headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res: any = {
    _status: 200,
    _body: undefined,
    _headers: headers,
    status(code: number) { this._status = code; return this; },
    json(body: any) { this._body = body; return this; },
    setHeader(k: string, v: string) { headers[k] = v; return this; },
  };
  return res;
}

async function loadRequireAdmin() {
  // Import dinâmico para garantir que beforeAll setou as env vars.
  const mod = await import('../middleware/auth');
  return mod.requireAdmin;
}

function signToken(payload: Record<string, unknown>, secret = 'a'.repeat(40)): string {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

describe('requireAdmin — bypass de rotas públicas', () => {
  it('libera /login mesmo sem token', async () => {
    const requireAdmin = await loadRequireAdmin();
    const req = makeReq({ url: '/login' });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect(res._status).toBe(200);
  });

  it('libera /admin/login (rota raiz)', async () => {
    const requireAdmin = await loadRequireAdmin();
    const req = makeReq({ url: '/admin/login' });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('libera /logout', async () => {
    const requireAdmin = await loadRequireAdmin();
    const req = makeReq({ url: '/logout' });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireAdmin — Authorization header', () => {
  it('rejeita request sem token', async () => {
    const requireAdmin = await loadRequireAdmin();
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita Bearer válido com role:admin', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).admin?.email).toBe('admin@example.test');
  });

  it('rejeita token com role != admin', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'x@y.test', role: 'user' });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(res._status).toBe(401);
  });

  it('rejeita token assinado com segredo errado', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'x@y.test', role: 'admin' }, 'wrong-secret-aaaaaaaaa');
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(res._status).toBe(401);
  });
});

describe('requireAdmin — Cookie httpOnly', () => {
  it('aceita cookie válido em request GET sem header', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({
      headers: { cookie: `lembrymed_admin_token=${encodeURIComponent(token)}` },
    });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('aceita cookie + ignora outras chaves de cookie', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({
      headers: {
        cookie: `other=value; lembrymed_admin_token=${encodeURIComponent(token)}; xx=yy`,
      },
    });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireAdmin — CSRF guard', () => {
  it('rejeita POST via cookie SEM X-Requested-With (defesa CSRF)', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({
      method: 'POST',
      headers: { cookie: `lembrymed_admin_token=${encodeURIComponent(token)}` },
    });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('aceita POST via cookie COM X-Requested-With', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({
      method: 'POST',
      headers: {
        cookie: `lembrymed_admin_token=${encodeURIComponent(token)}`,
        'x-requested-with': 'XMLHttpRequest',
      },
    });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });

  it('aceita POST via Authorization header (sem precisar de CSRF header)', async () => {
    const requireAdmin = await loadRequireAdmin();
    const token = signToken({ email: 'admin@example.test', role: 'admin' });
    const req = makeReq({
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    const res = makeRes();
    const next = vi.fn();
    requireAdmin(req as any, res as any, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});
