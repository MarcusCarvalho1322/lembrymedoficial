export default function SuccessPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#E8F0EB',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <img src="/logo.png" alt="Lembrymed" style={{ height: 56, marginBottom: 24 }} />
        <div aria-hidden="true" style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, color: '#1A5632', marginBottom: 12 }}>
          Pagamento confirmado!
        </h1>
        <p style={{ fontSize: 17, color: '#374151', lineHeight: 1.65, marginBottom: 20 }}>
          Sua assinatura do Lembrymed está ativa. Em instantes você receberá uma mensagem no WhatsApp
          para iniciar o cadastro dos seus medicamentos.
        </p>

        <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #D1D5DB', textAlign: 'left' }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: '#1A5632' }}>Próximos passos:</div>
          <div style={{ fontSize: 15, color: '#374151', lineHeight: 1.8 }}>
            1. Abra o WhatsApp e aguarde nossa mensagem<br />
            2. Cadastre seus medicamentos (texto ou foto)<br />
            3. Confirme o resumo e pronto!<br />
            4. A partir de amanhã, seus lembretes começam
          </div>
        </div>

        {/* Banner LGPD + suporte — cobertura para caso de webhook Stripe atrasar */}
        <div
          role="status"
          style={{
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            borderRadius: 12,
            padding: 16,
            marginTop: 20,
            fontSize: 14,
            color: '#92400E',
            textAlign: 'left',
            lineHeight: 1.5,
          }}
        >
          <strong>⏱️ Não recebeu em 5 minutos?</strong>
          <br />
          Verifique se o número de WhatsApp está correto e se o app não está bloqueando
          mensagens desconhecidas. Qualquer dúvida, envie e-mail para{' '}
          <a href="mailto:suporte@lembrymed.com.br" style={{ color: '#92400E', fontWeight: 700 }}>
            suporte@lembrymed.com.br
          </a>
          .
        </div>

        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 24, fontStyle: 'italic' }}>
          Este serviço não substitui orientação médica profissional. Leia nossa{' '}
          <a href="/privacidade" style={{ color: '#1A5632', textDecoration: 'underline' }}>
            Política de Privacidade
          </a>{' '}
          e os{' '}
          <a href="/termos" style={{ color: '#1A5632', textDecoration: 'underline' }}>
            Termos de Uso
          </a>
          .
        </p>
      </div>
    </main>
  );
}
