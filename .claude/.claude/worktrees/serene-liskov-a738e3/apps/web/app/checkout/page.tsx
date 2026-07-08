'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * /checkout é usado pelo Stripe como `cancel_url`. Antes desta consolidação
 * (Onda 3), era uma página independente com form próprio — duplicada em
 * relação ao modal da landing. Agora redirecionamos para a landing e
 * abrimos o modal automaticamente, mantendo uma única surface de checkout.
 */
function CheckoutRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const canceled = params.get('canceled');

  useEffect(() => {
    const url = canceled ? '/?checkout=1&canceled=1' : '/?checkout=1';
    router.replace(url);
  }, [router, canceled]);

  return <p style={{ color: '#4B5563', fontSize: 15 }}>Redirecionando…</p>;
}

export default function CheckoutPage() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Suspense fallback={<p style={{ color: '#4B5563', fontSize: 15 }}>Carregando…</p>}>
        <CheckoutRedirect />
      </Suspense>
    </div>
  );
}
