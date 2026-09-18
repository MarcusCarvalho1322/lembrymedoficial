/**
 * @module Serviço Stripe
 * @description Gerencia pagamentos, payment links e renovações.
 */

import Stripe from 'stripe';
import { env } from '../config/env';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Resolve o price_id do Stripe conforme o nível comercial.
 * Fallback: STRIPE_PRICE_ANNUAL (retrocompatibilidade).
 */
export function resolvePriceIdByTier(planTier: string | null | undefined): string {
  if (planTier === 'GOLD') {
    return env.STRIPE_PRICE_GOLD || env.STRIPE_PRICE_SILVER || env.STRIPE_PRICE_ANNUAL;
  }
  return env.STRIPE_PRICE_SILVER || env.STRIPE_PRICE_ANNUAL;
}

/**
 * Cria link de pagamento para renovação
 * @param patientId - ID do paciente no banco
 * @param plan - Plano legado (default: annual)
 * @param planTier - Nível comercial SILVER | GOLD (escolhe o preço)
 */
export async function createPaymentLink(
  patientId: string,
  plan: string = 'annual',
  planTier?: string | null
): Promise<{ url: string }> {
  const priceId = resolvePriceIdByTier(planTier);
  const tier = planTier === 'GOLD' ? 'GOLD' : 'SILVER';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { patientId, plan, planTier: tier, type: 'renewal' },
    success_url: `${env.WEB_URL}/success?renewed=1`,
    cancel_url: `${env.WEB_URL}/?canceled=1`,
    locale: 'pt-BR',
    payment_method_types: ['card', 'boleto', 'pix'],
  });

  return { url: session.url! };
}
