/**
 * @module Validação de variáveis de ambiente
 * @description Valida todas as env vars obrigatórias no boot. Falha fast se ausente.
 *
 * IMPORTANTE: este módulo deve ser importado no topo de `src/index.ts` para forçar
 * validação no boot. O `parse()` lança se qualquer env obrigatória faltar.
 *
 * Atualizado 2026-04-22 (Onda 3 da auditoria):
 *   - Reflete o stack real em produção: Z-API (não 360dialog), sem Managed Agents.
 *   - `NEXTAUTH_SECRET` é obrigatório em produção (removido fallback inseguro).
 *   - `ZAPI_WEBHOOK_TOKEN` é obrigatório em produção para autenticar webhook.
 */

import { z } from 'zod';

const isProd = process.env.NODE_ENV === 'production';

/** String obrigatória em prod, opcional em dev. */
const requiredInProd = (min = 1) =>
  isProd ? z.string().min(min) : z.string().min(min).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── Banco de dados (PostgreSQL self-hosted em container Docker) ───────────
  DATABASE_URL: z.string().url(),
  /** Usado apenas pelo drizzle-kit (migrations). Opcional — usa DATABASE_URL se ausente. */
  DATABASE_URL_UNPOOLED: z.string().url().optional(),

  // ── Redis (BullMQ + dedup webhook) ────────────────────────────────────────
  REDIS_URL: z.string().url(),

  // ── WhatsApp provider ─────────────────────────────────────────────────────
  WHATSAPP_PROVIDER: z
    .enum(['zapi', '360dialog', 'meta', 'twilio'])
    .default('zapi'),

  // Z-API (provider padrão em produção).
  // Obrigatórios quando WHATSAPP_PROVIDER=zapi em produção.
  ZAPI_INSTANCE_ID: z.string().optional(),
  ZAPI_TOKEN: z.string().optional(),
  ZAPI_CLIENT_TOKEN: z.string().optional(),

  /**
   * Token de segurança do webhook Z-API. **Obrigatório em produção.**
   * Configurado no painel Z-API → Settings → Webhook Security Token.
   */
  ZAPI_WEBHOOK_TOKEN: requiredInProd(16),

  // 360dialog / Meta / Twilio (code paths alternativos — opcionais)
  DIALOG_API_KEY: z.string().optional(),
  DIALOG_PHONE_NUMBER_ID: z.string().optional(),
  DIALOG_WEBHOOK_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  // ── Stripe ────────────────────────────────────────────────────────────────
  // Aceita secret key (sk_) ou restricted key (rk_). Ambas têm permissão
  // suficiente para criar checkout sessions e ler webhooks.
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .regex(/^(sk|rk)_(live|test)_/, 'deve começar com sk_live_/sk_test_/rk_live_/rk_test_'),
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith('whsec_'),
  STRIPE_PRICE_ANNUAL: z.string().trim().startsWith('price_'),
  /**
   * Plano Prata (R$ 149/ano) — lembrete individual, sem alerta familiar.
   * Fallback: STRIPE_PRICE_ANNUAL (retrocompatibilidade com plano único).
   */
  STRIPE_PRICE_SILVER: z.string().trim().startsWith('price_').optional(),
  /**
   * Plano Ouro (R$ 239/ano) — lembretes + alerta ao cuidador + relatórios.
   * Obrigatório quando há venda de Ouro; fallback para SILVER se ausente.
   */
  STRIPE_PRICE_GOLD: z.string().trim().startsWith('price_').optional(),

  // ── LLM Provider (DeepSeek V3 recomendado, Anthropic fallback) ────────────
  /** 'deepseek' (recomendado) | 'anthropic' (fallback) */
  LLM_PROVIDER: z.enum(['deepseek', 'anthropic']).default('deepseek'),
  /** DeepSeek API key (obrigatório se LLM_PROVIDER=deepseek) */
  DEEPSEEK_API_KEY: z.string().trim().optional(),
  /** DeepSeek base URL (default: https://api.deepseek.com) */
  DEEPSEEK_BASE_URL: z.string().url().optional(),
  /** Anthropic API key (obrigatório se LLM_PROVIDER=anthropic, mantido como fallback) */
  ANTHROPIC_API_KEY: z.string().trim().optional(),

  // ── URLs ──────────────────────────────────────────────────────────────────
  API_URL: z.string().url().optional(),
  WEB_URL: z.string().url(),

  // ── Admin ─────────────────────────────────────────────────────────────────
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(40), // bcrypt hash é ~60 chars
  /** Segredo para JWT admin. OBRIGATÓRIO em qualquer ambiente. */
  NEXTAUTH_SECRET: z.string().min(32),
  /** WhatsApp do admin para notificações de incidentes LGPD (opcional). */
  ADMIN_WHATSAPP: z.string().optional(),

  // ── Observabilidade ───────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Segredo para proteger o endpoint /metrics (opcional). */
  METRICS_SECRET: z.string().optional(),

  // ── App ──────────────────────────────────────────────────────────────────
  PORT: z.coerce.number().default(3000),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const msgs = result.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`);
    // eslint-disable-next-line no-console
    console.error(
      '\n╭───────────────────────────────────────────────────────────╮\n' +
        '│ ❌ Configuração inválida de variáveis de ambiente         │\n' +
        '╰───────────────────────────────────────────────────────────╯\n' +
        msgs.join('\n') +
        '\n\nVerifique seu .env (ou as env vars do Docker Compose).\n',
    );
    // Em produção: interrompe o boot. Em dev: também interrompe (fail fast).
    process.exit(1);
  }

  // Warnings adicionais para configurações válidas mas arriscadas
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    if (env.WHATSAPP_PROVIDER === 'zapi' && !env.ZAPI_INSTANCE_ID) {
      // eslint-disable-next-line no-console
      console.error('❌ WHATSAPP_PROVIDER=zapi exige ZAPI_INSTANCE_ID, ZAPI_TOKEN em produção.');
      process.exit(1);
    }
    // Validar LLM provider
    if (env.LLM_PROVIDER === 'deepseek' && !env.DEEPSEEK_API_KEY) {
      console.error('❌ LLM_PROVIDER=deepseek exige DEEPSEEK_API_KEY em produção.');
      process.exit(1);
    }
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      console.error('❌ LLM_PROVIDER=anthropic exige ANTHROPIC_API_KEY em produção.');
      process.exit(1);
    }
  }

  return env;
}

/** Variáveis de ambiente validadas (fail-fast no boot) */
export const env = parseEnv();
