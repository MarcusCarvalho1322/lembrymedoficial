import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Lembrymed',
  description:
    'Como o Lembrymed coleta, usa e protege seus dados pessoais e de saúde conforme a LGPD (Lei 13.709/2018).',
};

export default function PrivacyPolicyPage() {
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

      <h1 style={{ fontSize: 36, color: '#1A5632', marginBottom: 8 }}>Política de Privacidade</h1>
      <p style={{ color: '#4B5563', fontSize: 14, marginBottom: 32 }}>
        Versão v1.0 — vigente desde 22 de abril de 2026.
      </p>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          1. Quem somos
        </h2>
        <p>
          O <strong>Lembrymed</strong> é um serviço operado por <strong>BIZZ.IA Intelligence
          Ecosystem</strong> (doravante "nós"), com sede em Sinop/MT, Brasil. Oferecemos
          lembretes de medicamentos via WhatsApp para pacientes com prescrição médica
          ativa.
        </p>
        <p>
          <strong>Encarregado de Dados (DPO):</strong> Dr. Marcus Cardoso Carvalho.
          <br />
          Contato: <a href="mailto:privacidade@lembrymed.com.br">privacidade@lembrymed.com.br</a>
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          2. Dados que coletamos
        </h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Dados de identificação:</strong> nome completo, e-mail, número de WhatsApp.
          </li>
          <li>
            <strong>Dados de saúde (categoria especial — Art. 11 LGPD):</strong> medicamentos
            prescritos, dosagens, horários de administração, observações que você compartilhar
            com o bot (ex: sintomas, alergias mencionadas na conversa).
          </li>
          <li>
            <strong>Dados de cuidador (opcional):</strong> nome e WhatsApp do familiar/cuidador
            indicado para receber alertas de não-confirmação.
          </li>
          <li>
            <strong>Dados transacionais:</strong> histórico de pagamentos via Stripe (processados
            pela Stripe Inc. e não armazenados por nós).
          </li>
          <li>
            <strong>Dados técnicos:</strong> endereço IP no momento do checkout, user-agent,
            timestamps de interação.
          </li>
          <li>
            <strong>Histórico de uso:</strong> confirmações e recusas de medicação, registros de
            alertas ao familiar, conversas com o assistente virtual.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          3. Finalidades e base legal
        </h2>
        <p>Usamos seus dados exclusivamente para:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Enviar lembretes de medicação</strong> nos horários cadastrados, via WhatsApp —
            base legal: consentimento (Art. 7 IX LGPD) e tutela da saúde (Art. 11 II-a).
          </li>
          <li>
            <strong>Registrar confirmações de tomada</strong> e manter histórico de adesão.
          </li>
          <li>
            <strong>Alertar o contato familiar</strong> quando você não confirma um medicamento
            em tempo hábil (apenas se você cadastrou um contato).
          </li>
          <li>
            <strong>Gerar relatório mensal de adesão</strong> que pode ser compartilhado com seu
            médico assistente.
          </li>
          <li>
            <strong>Cumprir obrigações legais/regulatórias</strong> (fiscais, CFM, LGPD).
          </li>
        </ul>
        <p>
          Não vendemos, alugamos nem cedemos seus dados a terceiros para fins de marketing.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          4. Compartilhamento com fornecedores (subcontratados)
        </h2>
        <p>
          Utilizamos fornecedores técnicos (operadores, na terminologia da LGPD) para viabilizar
          o serviço:
        </p>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Z-API</strong> (Brasil) — intermediação WhatsApp Business.
          </li>
          <li>
            <strong>Neon</strong> (EUA) — banco de dados PostgreSQL serverless.
          </li>
          <li>
            <strong>Railway</strong> (EUA) — hospedagem do backend.
          </li>
          <li>
            <strong>Vercel</strong> (EUA) — hospedagem do site e do painel.
          </li>
          <li>
            <strong>Stripe</strong> (EUA/Brasil) — processamento de pagamentos.
          </li>
          <li>
            <strong>Anthropic</strong> (EUA) — modelo de IA Claude, usado para interpretar as
            mensagens do paciente e extrair a lista de medicamentos.
          </li>
        </ul>
        <p>
          Esses fornecedores possuem suas próprias políticas de privacidade e estão sujeitos
          a DPAs (Data Processing Agreements) que exigem níveis técnicos e organizacionais
          adequados de segurança.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          5. Seus direitos (Art. 18 LGPD)
        </h2>
        <p>A qualquer momento, você pode:</p>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Confirmar</strong> se tratamos seus dados;
          </li>
          <li>
            <strong>Acessar</strong> seus dados;
          </li>
          <li>
            <strong>Corrigir</strong> dados desatualizados;
          </li>
          <li>
            <strong>Anonimizar, bloquear ou eliminar</strong> dados desnecessários;
          </li>
          <li>
            <strong>Portabilidade</strong> (exportação em formato estruturado);
          </li>
          <li>
            <strong>Eliminação</strong> dos dados tratados com base em consentimento;
          </li>
          <li>
            <strong>Revogar o consentimento</strong> a qualquer momento.
          </li>
        </ul>
        <p>
          <strong>Como exercer:</strong>
        </p>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Via WhatsApp:</strong> envie a palavra-chave{' '}
            <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>
              EXPORTAR MEUS DADOS
            </code>{' '}
            ou{' '}
            <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>
              EXCLUIR MEUS DADOS
            </code>{' '}
            para o número do Lembrymed.
          </li>
          <li>
            <strong>Via e-mail:</strong> escreva para{' '}
            <a href="mailto:privacidade@lembrymed.com.br">privacidade@lembrymed.com.br</a>.
          </li>
        </ul>
        <p>
          Responderemos em até <strong>15 dias corridos</strong>, conforme Art. 19 LGPD.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          6. Retenção e descarte
        </h2>
        <ul style={{ paddingLeft: 24 }}>
          <li>
            <strong>Conversas WhatsApp:</strong> o texto da conversa é anonimizado após 90 dias
            automaticamente; metadados (timestamp, direção) são preservados para métricas
            agregadas.
          </li>
          <li>
            <strong>Histórico de confirmações:</strong> mantido enquanto sua conta estiver ativa,
            para cálculo de adesão.
          </li>
          <li>
            <strong>Dados financeiros:</strong> mantidos pelo período exigido pela legislação
            fiscal (5 anos).
          </li>
          <li>
            <strong>Conta excluída:</strong> após confirmação do pedido, os dados são apagados
            em até 15 dias, exceto aqueles que devemos reter por obrigação legal.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          7. Segurança
        </h2>
        <p>
          Adotamos medidas técnicas e administrativas razoáveis para proteger seus dados:
          criptografia em trânsito (TLS 1.2+), criptografia em repouso (padrão do provedor
          Neon), controle de acesso por papéis, autenticação multifator em contas
          administrativas, auditoria de acesso aos dados de pacientes, retenção limitada,
          e revisão regular de vulnerabilidades. Nenhum sistema é 100% imune — se você
          identificar algo suspeito, contate-nos imediatamente.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          8. Menores de idade
        </h2>
        <p>
          O Lembrymed não é destinado a menores de 18 anos. Para pacientes menores, o
          responsável legal deve ser o titular da conta e do consentimento.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          9. Alterações nesta política
        </h2>
        <p>
          Podemos atualizar esta política. Mudanças materiais serão comunicadas por WhatsApp
          ou e-mail. O histórico de versões é mantido em nossos registros internos
          (tabela <code>privacy_policies</code>).
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 22, marginTop: 32, marginBottom: 12, color: '#1A5632' }}>
          10. Autoridade de proteção
        </h2>
        <p>
          Se você não for atendido satisfatoriamente, pode reclamar junto à{' '}
          <a href="https://www.gov.br/anpd/pt-br" target="_blank" rel="noopener noreferrer">
            Autoridade Nacional de Proteção de Dados (ANPD)
          </a>
          .
        </p>
      </section>

      <p style={{ marginTop: 48, fontSize: 13, color: '#4B5563', fontStyle: 'italic' }}>
        Este serviço não substitui orientação médica profissional.
      </p>
    </main>
  );
}
