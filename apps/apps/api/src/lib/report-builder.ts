/**
 * @module Report Builder
 * @description Gera o texto do relatório mensal de adesão a medicamentos.
 * Função pura extraída do lifecycle.worker.ts para ser testável de forma isolada.
 *
 * Formata métricas de adesão em mensagem WhatsApp com barra de progresso.
 */

export interface MedReport {
  name: string;
  dosage: string;
  totalDoses: number;
  confirmed: number;
  denied: number;
  noResponse: number;
}

/**
 * Constrói o texto completo do relatório mensal de adesão.
 *
 * @param patientName - Nome completo do paciente
 * @param month       - Período do relatório (ex: "Janeiro/2026")
 * @param meds        - Estatísticas por medicamento
 * @param forFamily   - true = versão para familiar; false = versão para o paciente
 * @param familyName  - Nome do familiar (obrigatório se forFamily = true)
 */
export function buildMonthlyReportText(
  patientName: string,
  month: string,
  meds: MedReport[],
  forFamily: boolean,
  familyName?: string,
): string {
  const firstName = patientName.split(' ')[0];

  const totalDoses     = meds.reduce((s, m) => s + m.totalDoses, 0);
  const totalConfirmed = meds.reduce((s, m) => s + m.confirmed, 0);
  const adherencePct   = totalDoses > 0
    ? Math.round((totalConfirmed / totalDoses) * 100)
    : 0;

  const medal =
    adherencePct >= 90 ? '🏆 Excelente' :
    adherencePct >= 75 ? '✅ Boa'       :
    adherencePct >= 50 ? '⚠️ Regular'  :
                         '❌ Baixa';

  const header = forFamily
    ? `📋 *Relatório de Medicamentos — ${month}*\n` +
      `Paciente: *${patientName}*\n` +
      `Olá, ${familyName}! Segue o relatório mensal de adesão aos medicamentos.\n\n`
    : `📋 *Seu Relatório de Medicamentos — ${month}*\n` +
      `${firstName}, aqui está seu resumo de adesão do mês! Guarde para mostrar ao seu médico. 👨‍⚕️\n\n`;

  const medLines = meds.map((m) => {
    const pct = m.totalDoses > 0 ? Math.round((m.confirmed / m.totalDoses) * 100) : 0;
    const barFull  = Math.round(pct / 10);
    const barEmpty = 10 - barFull;
    const bar = '▓'.repeat(barFull) + '░'.repeat(barEmpty);
    return (
      `💊 *${m.name} ${m.dosage}*\n` +
      `   ${bar} ${pct}%\n` +
      `   ✅ Confirmadas: ${m.confirmed}/${m.totalDoses} doses\n` +
      (m.denied     > 0 ? `   ❌ Não tomadas: ${m.denied}\n`         : '') +
      (m.noResponse > 0 ? `   ⏳ Sem resposta: ${m.noResponse}\n`    : '')
    );
  }).join('\n');

  const footer = forFamily
    ? `\n📊 *Adesão geral: ${adherencePct}% — ${medal}*\n\n` +
      `Este relatório foi gerado automaticamente pelo *Lembrymed*.\n` +
      `Leve ao médico de ${firstName} na próxima consulta! 🩺`
    : `\n📊 *Sua adesão geral: ${adherencePct}% — ${medal}*\n\n` +
      `Leve este relatório ao seu médico na próxima consulta! 🩺\n` +
      `O Lembrymed continua aqui para te ajudar a cuidar da sua saúde. 💙`;

  return header + medLines + footer;
}
