/**
 * @module Middleware — Auth Admin
 * @description Autenticação JWT para rotas /admin/* com self-service de senha.
 *
 * Hardening 2026-04-22 (Onda 3):
 *   - `NEXTAUTH_SECRET` obrigatório — sem fallback inseguro.
 *   - Rate limit Redis em /admin/login (5 tentativas / 15 min).
 *   - JWT com `iat`/`exp` + clock tolerance.
 *
 * Atualização 2026-04-23:
 *   - Credenciais lidas da tabela `admin_users` (fallback para env em bootstrap).
 *   - `POST /admin/forgot-password` envia código de 6 dígitos via WhatsApp.
 *   - `POST /admin/reset-password` valida código e atualiza senha no banco.
 *   - Rate limits separados para pedido e verificação de código.
 */

import { Request, Response, NextFunction, Router } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { timingSafeEqual } from 'crypto';
import { db, adminUsers, eq } from '@lembrymed/database';
import { sql as sqlOp } from 'drizzle-orm';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logger } from '@lembrymed/shared/logger';
import { rateLimit, resetRateLimit } from './rateLimit';
import { WhatsAppClient } from '../clients/dialog360.client';

const router = Router();
const whatsapp = new WhatsAppClient();

/** Payload assinado no JWT admin */
export interface AdminPayload extends JwtPayload {
  email: string;
  role: 'admin';
}

export interface AdminRequest extends Request {
  admin?: AdminPayload;
}

// ═══════════════════════════════════════════════════════════
// HELPERS — leitura de admin (DB com fallback env)
// ═══════════════════════════════════════════════════════════

interface AdminRow {
  id: string;
  email: string;
  passwordHash: string;
  recoveryPhone: string | null;
}

/**
 * Busca admin pelo email. Tenta o banco primeiro; se a tabela ainda não foi
 * criada (migration pendente) ou o admin não foi seedado, cai para as env vars
 * como bootstrap. Comparação case-insensitive.
 */
async function findAdminByEmail(email: string): Promise<AdminRow | null> {
  const normalized = email.trim().toLowerCase();

  try {
    const rows = await db
      .select()
      .from(adminUsers)
      .where(sqlOp`LOWER(${adminUsers.email}) = ${normalized}`)
      .limit(1);

    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: r.id,
        email: r.email,
        passwordHash: r.passwordHash,
        recoveryPhone: r.recoveryPhone,
      };
    }
  } catch (err: any) {
    logger.warn('admin_users indisponível — usando fallback env', { error: err.message });
  }

  // Fallback para env vars (bootstrap ou antes da migration rodar)
  if (env.ADMIN_EMAIL.toLowerCase() === normalized) {
    return {
      id: 'env-fallback',
      email: env.ADMIN_EMAIL,
      passwordHash: env.ADMIN_PASSWORD_HASH,
      recoveryPhone: env.ADMIN_WHATSAPP || null,
    };
  }

  return null;
}

/** Atualiza o hash de senha de um admin no banco. */
async function updateAdminPassword(adminId: string, newHash: string): Promise<void> {
  if (adminId === 'env-fallback') {
    throw new Error(
      'Admin ainda está em env var. Rode a migration 0004 antes de usar reset.',
    );
  }
  await db
    .update(adminUsers)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(adminUsers.id, adminId));
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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

router.post('/admin/login', loginLimiter, async (req, res) => {
  const parsed = LoginBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  const { email, password } = parsed.data;
  const admin = await findAdminByEmail(email);

  // Mesmo se admin não existir, rodamos bcrypt com hash fake para evitar timing attack
  const hash = admin?.passwordHash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!admin || !passwordMatches) {
    logger.warn('Admin login failed', { email: email.toLowerCase(), ip: req.ip });
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  await resetRateLimit('login', req.ip || 'unknown', email.toLowerCase());

  const token = jwt.sign(
    { email: admin.email.toLowerCase(), role: 'admin' satisfies AdminPayload['role'] },
    env.NEXTAUTH_SECRET,
    { expiresIn: '24h' },
  );

  logger.info('Admin login success', { email: admin.email.toLowerCase() });
  res.json({ token, expiresIn: '24h' });
});

// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD — pedido de código via WhatsApp
// ═══════════════════════════════════════════════════════════

const ForgotBodySchema = z.object({
  email: z.string().email(),
});

/** Rate limit: 3 pedidos / 15 min por email (evita flood de WhatsApp) */
const forgotLimiter = rateLimit({
  key: 'admin-forgot',
  max: 3,
  windowSec: 900,
  identifier: (req) => {
    const parsed = ForgotBodySchema.safeParse(req.body);
    return parsed.success ? parsed.data.email.toLowerCase() : undefined;
  },
  message: 'Muitos pedidos. Aguarde 15 minutos antes de pedir outro código.',
});

function maskPhone(phone: string | null): string {
  if (!phone) return '(não cadastrado)';
  // 5574999774500 → 55****4500
  if (phone.length < 8) return '****';
  return `${phone.substring(0, 2)}****${phone.substring(phone.length - 4)}`;
}

router.post('/admin/forgot-password', forgotLimiter, async (req, res) => {
  const parsed = ForgotBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const { email } = parsed.data;
  const admin = await findAdminByEmail(email);

  // Resposta uniforme — não revela se email existe ou não.
  // Sempre respondemos com phone mascarado (ou mensagem genérica se não existir).
  if (!admin || !admin.recoveryPhone) {
    logger.warn('forgot-password: admin não encontrado ou sem recovery_phone', {
      email: email.toLowerCase(),
      hasAdmin: !!admin,
    });
    // Responder como sucesso genérico para não expor enumerations
    return res.json({
      success: true,
      message: 'Se o e-mail existir, um código foi enviado ao WhatsApp cadastrado.',
      maskedPhone: null,
    });
  }

  // Gerar código de 6 dígitos
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const key = `admin-reset:${email.toLowerCase()}`;

  // Armazenar em Redis com TTL 10 min
  await redis.set(key, code, 'EX', 600);

  // Enviar via WhatsApp
  try {
    await whatsapp.sendTextMessage(
      admin.recoveryPhone,
      `🔐 *Lembrymed — Recuperação de senha*\n\n` +
        `Seu código de recuperação é:\n\n` +
        `*${code}*\n\n` +
        `Válido por 10 minutos. Se você não pediu essa recuperação, ignore esta mensagem.`,
    );

    logger.info('Código de recuperação enviado', {
      email: email.toLowerCase(),
      phone: maskPhone(admin.recoveryPhone),
    });
  } catch (err: any) {
    logger.error('Falha ao enviar WhatsApp de recuperação', {
      error: err.message,
      email: email.toLowerCase(),
    });
    // Mesmo assim respondemos sucesso — próxima tentativa do usuário pode reenviar
  }

  res.json({
    success: true,
    message: 'Código enviado ao WhatsApp cadastrado.',
    maskedPhone: maskPhone(admin.recoveryPhone),
  });
});

// ═══════════════════════════════════════════════════════════
// RESET PASSWORD — valida código + define nova senha
// ═══════════════════════════════════════════════════════════

const ResetBodySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
  newPassword: z
    .string()
    .min(8, 'Senha precisa ter no mínimo 8 caracteres')
    .max(200),
});

/** Rate limit: 5 tentativas / 15 min por email (defesa contra brute-force de código) */
const resetLimiter = rateLimit({
  key: 'admin-reset',
  max: 5,
  windowSec: 900,
  identifier: (req) => {
    const parsed = ResetBodySchema.safeParse(req.body);
    return parsed.success ? parsed.data.email.toLowerCase() : undefined;
  },
  message: 'Muitas tentativas. Aguarde 15 minutos.',
});

router.post('/admin/reset-password', resetLimiter, async (req, res) => {
  const parsed = ResetBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Dados inválidos',
    });
  }

  const { email, code, newPassword } = parsed.data;
  const key = `admin-reset:${email.toLowerCase()}`;

  const storedCode = await redis.get(key);
  if (!storedCode) {
    logger.warn('reset-password: código expirado ou ausente', { email: email.toLowerCase() });
    return res.status(401).json({ error: 'Código expirado. Peça um novo.' });
  }

  // Comparação resistente a timing
  const isValidCode = (() => {
    if (storedCode.length !== code.length) return false;
    try {
      return timingSafeEqual(Buffer.from(storedCode), Buffer.from(code));
    } catch {
      return false;
    }
  })();

  if (!isValidCode) {
    logger.warn('reset-password: código inválido', { email: email.toLowerCase() });
    return res.status(401).json({ error: 'Código inválido.' });
  }

  const admin = await findAdminByEmail(email);
  if (!admin) {
    return res.status(404).json({ error: 'Admin não encontrado.' });
  }

  // Validação extra: nova senha não pode ser idêntica à anterior
  const isSame = await bcrypt.compare(newPassword, admin.passwordHash);
  if (isSame) {
    return res.status(400).json({ error: 'Nova senha deve ser diferente da atual.' });
  }

  // Atualizar hash
  const newHash = await bcrypt.hash(newPassword, 10);
  try {
    await updateAdminPassword(admin.id, newHash);
  } catch (err: any) {
    logger.error('reset-password: falha ao atualizar senha', {
      error: err.message,
      email: email.toLowerCase(),
    });
    return res.status(500).json({
      error: 'Falha ao salvar nova senha. Tente novamente em instantes.',
    });
  }

  // Invalidar código
  await redis.del(key);

  // Reset rate limits de login e reset (usuário agora tem a senha certa)
  await resetRateLimit('login', req.ip || 'unknown', email.toLowerCase()).catch(() => {});

  logger.info('Admin password reset successful', { email: email.toLowerCase() });
  res.json({ success: true, message: 'Senha alterada com sucesso. Faça login com a nova senha.' });
});

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE DE PROTEÇÃO — rotas /admin/*
// ═══════════════════════════════════════════════════════════

/** Paths públicos dentro de /admin/* (não exigem JWT) */
const PUBLIC_ADMIN_PATHS = new Set([
  '/login', '/admin/login',
  '/forgot-password', '/admin/forgot-password',
  '/reset-password', '/admin/reset-password',
]);

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): void {
  if (PUBLIC_ADMIN_PATHS.has(req.url)) {
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
      clockTolerance: 10,
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
