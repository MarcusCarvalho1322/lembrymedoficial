/**
 * @module API Route — Checkout Stripe
 * @description Cria sessão de pagamento Stripe e retorna URL de checkout.
 * Chamado pelo formulário da landing + página /checkout.
 *
 * Hardening 2026-04-22 (Onda 3):
 *   - Validação Zod do body.
 *   - Registro de consentimento LGPD (metadata Stripe → webhook persiste em consent_logs).
 *   - Fallback mais seguro de URL pública.
 *   - Mensagens de erro em português, uniformes.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia' as any,
});

const CheckoutBody = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => {
        const d = v.replace(/\D/g, '');
        // Aceita DDD+número (10-11 dígitos) ou com 55 prefixo (12-13 dígitos)
        return /^(55)?\d{10,11}$/.test(d);
      },
      { message: 'Telefone inválido. Inclua DDD (ex: 11 99999-9999).' },
    ),
  consentAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Consentimento obrigatório para prosseguir.' }),
  }),
  consentVersion: z.string().min(3).max(50),
});

/** Normaliza telefone para formato E.164 brasileiro (55DDDXXXXXXXXX). */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  return (fwd.split(',')[0] || '').trim() || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = CheckoutBody.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Dados inválidos';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const { name, email, phone, consentVersion } = parsed.data;

    const formattedPhone = formatPhone(phone);

    const webUrl =
      process.env.NEXT_PUBLIC_WEB_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : null) ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'https://lembrymed.com.br';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ANNUAL!, quantity: 1 }],
      customer_email: email,
      metadata: {
        name,
        phone: formattedPhone,
        source: 'landing-page',
        // LGPD — metadata é persistido e o webhook Stripe grava em consent_logs
        consentVersion,
        consentIp: clientIp(req),
        consentUserAgent: (req.headers.get('user-agent') || '').slice(0, 200),
      },
      phone_number_collection: { enabled: false },
      custom_text: {
        submit: {
          message: 'Após o pagamento você receberá uma mensagem no WhatsApp para ativar seus lembretes.',
        },
      },
      success_url: `${webUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webUrl}/checkout?canceled=1`,
      locale: 'pt-BR',
      payment_method_types: ['card', 'boleto'],
      billing_address_collection: 'required',
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error('Checkout error:', error.message);
    return NextResponse.json(
      { error: 'Erro ao criar sessão de pagamento. Tente novamente.' },
      { status: 500 },
    );
  }
}
