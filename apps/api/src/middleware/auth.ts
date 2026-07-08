/**
 * @module Middleware — Auth Admin
 * @description Autenticação JWT para rotas /admin/*.
 *
 * Hardening 2026-04-22 (Onda 3 da auditoria):
 *   - `NEXTAUTH_SECRET` é obrigatório — sem fallback inseguro.
 *   - Rate limit Redis em /admin/login (5 tentativas / 15 min por IP+email).
 *   - JWT com `iat`/`exp` + clock tolerance; resposta 401 uniforme.
 *   - Tipagem forte — `AdminRequest` expõe `req.admin` sem casts.
 *   - Log de auditoria: login sucesso e falhas (sem vazar senha).
 */

import { Request, Response, NextFunction, Router } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '@lembrymed/shared/logger';
import { rateLimit, resetRateLimit } from './rateLimit';

const router = Router();

/** Payload assinado no JWT admin */
export interface AdminPayload extends JwtPayload {
  email: string;
  role: 'admin';
}

/** Request estendido com `req.admin` populado pelo `requireAdmin` */
export interface AdminRequest extends Request {
  admin?: AdminPayload;
}

/** Schema do body de /admin/login */
const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Middleware de rate limit específico para login.
 *   - 5 tentativas em 15 min por IP
 *   - Chave composta: IP + email (se body vier) para defesa em profundidade
 */
const loginLimiter = rateLimit({
  key: 'login',
  max: 5,
  windowSec: 900, // 15 min
  identifier: (req) => {
    const parsed = LoginBodySchema.safeParse(req.body);
    return parsed.success ? parsed.data.email.toLowerCase() : undefined;
  },
  message:
    'Muitas tentativas de login. Aguarde 15 minutos antes de tentar novamente.',
});

/** POST /admin/login — autentica admin → retorna JWT de 24h */
router.post('/admin/login', loginLimiter, async (req, res) => {
  const parsed = LoginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  const { email, password } = parsed.data;

  // Comparar email de forma case-insensitive e estável (evita timing)
  const emailMatches = email.trim().toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

  // SEMPRE rodar bcrypt.compare — mesmo com email errado — para evitar timing
  // attack que revele se o email existe.
  const hash = env.ADMIN_PASSWORD_HASH;
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!emailMatches || !passwordMatches) {
    logger.warn('Admin login failed', {
      emailPresent: !!email,
      ip: req.ip,
    });
    // Mensagem uniforme para não revelar qual campo está errado
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Sucesso — zera rate limit (não punir admin que errou senha antes)
  await resetRateLimit('login', req.ip || 'unknown', email.toLowerCase());

  const token = jwt.sign(
    { email: email.toLowerCase(), role: 'admin' satisfies AdminPayload['role'] },
    env.NEXTAUTH_SECRET,
    { expiresIn: '24h' },
  );

  logger.info('Admin login success', { email: email.toLowerCase() });
  res.json({ token, expiresIn: '24h' });
});

/** Middleware — exige JWT admin válido em req.headers.authorization */
export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  // Quando montado em `app.use('/admin/*', requireAdmin)`, o `req.url` local
  // é o path depois do mount (ex: "/login" para /admin/login). Aceitamos
  // tanto `/login` quanto `/admin/login` para ser robusto a mudanças de mount.
  if (req.url === '/login' || req.url === '/admin/login') {
    next();
    return;
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token ausente' });
    return;
  }

  try {
    const payload = jwt.verify(auth.slice('Bearer '.length), env.NEXTAUTH_SECRET, {
      clockTolerance: 10, // tolerância de 10s para skew de relógio
    }) as AdminPayload;

    if (payload.role !== 'admin') {
      throw new Error('Sem permissão');
    }

    req.admin = payload;
    next();
  } catch (err: any) {
    logger.debug('Admin JWT inválido', { error: err.message });
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export default router;
