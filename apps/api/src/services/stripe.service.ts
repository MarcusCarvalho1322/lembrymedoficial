/**
 * @module Serviço Stripe
 * @description Gerencia pagamentos, payment links e renovações.
 */

import Stripe from 'stripe';
import { env } from '../config/env';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

/**
 * Cria link de pagamento para renovação
 * @param patientId - ID do paciente no banco
 * @param plan - Plano (default: annual)
 */
export async function createPaymentLink(
  patientId: string,
  plan: string = 'annual'
): Promise<{ url: string }> {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: env.STRIPE_PRICE_ANNUAL, quantity: 1 }],
    metadata: { patientId, plan, type: 'renewal' },
    success_url: `${env.WEB_URL}/success?renewed=1`,
    cancel_url: `${env.WEB_URL}/?canceled=1`,
    locale: 'pt-BR',
    payment_method_types: ['card'],
  });

  return { url: session.url! };
}
