import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de Uso — Lembrymed',
  description:
    'Condições de uso do serviço Lembrymed — lembretes de medicação via WhatsApp.',
};

export default function TermsPage() {
  return (
    <main
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '60px 24px',
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.7,
        color: '#1A1A1A',
        background: '#FFFFFF',
        minHeight: '100vh',
      }}
    >
      <nav style={{ marginBottom: 32 }}>
        <a href="/" style={{ color: '#1A5632', textDecoration: 'none', fontWeight: 600 }}>
          ← Voltar para a página inicial
        </a>
      </nav>

      <h1 style={{ fontSize: 36, color: '#1A5632', marginBottom: 8 }}>Termos de Uso</h1>
      <p style={{ color: '#4B5563', fontSize: 14, marginBottom: 32 }}>
        Versão v1.0 — vigente desde 22 de abril de 2026.
      </p>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          1. Natureza do serviço
        </h2>
        <p>
          O Lembrymed é um serviço de <strong>lembretes</strong> de medicação via WhatsApp. Não
          substitui consulta médica, prescrição nem acompanhamento profissional. Em nenhuma
          hipótese o Lembrymed diagnostica doenças, prescreve medicamentos ou ajusta
          posologia.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          2. Requisitos mínimos
        </h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>Ter 18 anos ou mais. Para menores, a assinatura deve ser feita pelo responsável legal.</li>
          <li>Possuir WhatsApp ativo no número informado no cadastro.</li>
          <li>Ter prescrição médica vigente dos medicamentos que deseja cadastrar.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          3. Pagamento e renovação
        </h2>
        <p>
          O plano anual custa <strong>R$ 149,00</strong>, cobrado no ato do cadastro via
          Stripe (cartão, Pix ou boleto). A assinatura <strong>não</strong> é renovada
          automaticamente — próximo ao vencimento enviamos lembretes e um link para nova
          compra. Em caso de não renovação, seus lembretes são pausados mas seus dados
          permanecem acessíveis por 90 dias.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          4. Arrependimento
        </h2>
        <p>
          Conforme Art. 49 do Código de Defesa do Consumidor, você pode desistir em até 7
          dias contados do pagamento, com reembolso integral. Basta enviar a palavra{' '}
          <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>
            ARREPENDIMENTO
          </code>{' '}
          para o WhatsApp do Lembrymed ou e-mail{' '}
          <a href="mailto:suporte@lembrymed.com.br">suporte@lembrymed.com.br</a>.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          5. Disponibilidade
        </h2>
        <p>
          Nos esforçamos para manter o serviço disponível 24/7. No entanto, o Lembrymed
          depende de serviços de terceiros (WhatsApp/Meta, Z-API, provedores de
          infraestrutura). Eventuais instabilidades desses terceiros podem causar atrasos
          ou falhas em lembretes individuais — <strong>não dependa apenas do Lembrymed
          para medicamentos de risco agudo</strong> (ex: insulina de resgate, adrenalina).
          Mantenha alarmes/lembretes secundários como backup.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          6. Uso responsável
        </h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>Cadastre apenas medicamentos que você toma efetivamente.</li>
          <li>Informe ao seu médico que usa o Lembrymed.</li>
          <li>Em caso de efeito adverso ou sintoma preocupante, procure atendimento médico imediatamente.</li>
          <li>Não compartilhe seu número de WhatsApp cadastrado com terceiros.</li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          7. Limitação de responsabilidade
        </h2>
        <p>
          Na máxima extensão permitida por lei, a BIZZ.IA Intelligence Ecosystem não se
          responsabiliza por danos decorrentes de: (a) atrasos ou falhas no envio de
          lembretes causadas por serviços de terceiros; (b) tomada ou não-tomada de
          medicamento em desacordo com a prescrição médica; (c) informações incorretas
          fornecidas pelo próprio paciente. A responsabilidade total por qualquer dano
          fica limitada ao valor pago pela assinatura do ano corrente.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          8. Alterações
        </h2>
        <p>
          Podemos atualizar estes Termos. Mudanças substanciais serão comunicadas por
          WhatsApp com pelo menos 30 dias de antecedência. Se você não concordar, pode
          cancelar a assinatura e solicitar reembolso proporcional.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          9. Foro
        </h2>
        <p>
          Fica eleito o foro da Comarca de Sinop/MT para dirimir controvérsias, ressalvada
          a prerrogativa do consumidor de optar pelo foro de seu domicílio (Art. 101 CDC).
        </p>
      </section>

      <p style={{ marginTop: 48, fontSize: 13, color: '#4B5563', fontStyle: 'italic' }}>
        Em caso de dúvida, escreva para{' '}
        <a href="mailto:suporte@lembrymed.com.br">suporte@lembrymed.com.br</a>.
      </p>
    </main>
  );
}
