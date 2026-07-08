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

  // ── Banco de dados ────────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
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
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  STRIPE_PRICE_ANNUAL: z.string().startsWith('price_'),

  // ── Anthropic Claude ──────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),

  // ── URLs ──────────────────────────────────────────────────────────────────
  API_URL: z.string().url().optional(),
  WEB_URL: z.string().url(),

  // ── Admin ─────────────────────────────────────────────────────────────────
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(40), // bcrypt hash é ~60 chars
  /** Segredo para JWT admin. OBRIGATÓRIO em qualquer ambiente. */
  NEXTAUTH_SECRET: z.string().min(32),

  // ── Observabilidade ───────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

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
        '\n\nVerifique seu .env (ou as env vars do Railway/Vercel).\n',
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
  }

  return env;
}

/** Variáveis de ambiente validadas (fail-fast no boot) */
export const env = parseEnv();
