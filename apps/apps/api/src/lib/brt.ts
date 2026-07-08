/**
 * @module BRT Timezone Utilities
 * @description Funções puras para conversão de datas/horas para o
 * timezone do Brasil (America/Sao_Paulo, UTC-3 no inverno / UTC-2 no verão).
 *
 * Centraliza a lógica que antes estava duplicada em 5+ arquivos.
 * DST-safe: usa Intl.DateTimeFormat (IANA tz database) em vez de offset fixo.
 */

/**
 * Retorna um objeto Date cujas propriedades getHours/getMinutes/getDate
 * refletem a hora atual em Brasília (BRT), respeitando DST automaticamente.
 *
 * IMPORTANTE: o valor getTime() deste Date ainda está em UTC — mas os
 * métodos de componente (getHours etc.) retornam a hora BRT. Isso permite
 * comparação direta com os horários HH:MM cadastrados pelos pacientes.
 */
export function getNowBRT(now = new Date()): Date {
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

/**
 * Retorna a data atual em BRT no formato YYYY-MM-DD (padrão ISO 8601 de data).
 * Usa en-CA que gera YYYY-MM-DD diretamente via Intl.
 *
 * Evita o bug de cruzamento de meia-noite: entre 21:00 e 23:59 BRT,
 * o UTC já está no dia seguinte — CURRENT_DATE no PostgreSQL retornaria
 * a data errada nesse intervalo.
 */
export function getTodayBRT(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(now);
}

/**
 * Adiciona N dias à data atual em BRT e retorna no formato YYYY-MM-DD.
 *
 * DST-safe: opera sobre o objeto Date já convertido para BRT, de modo que
 * a adição de dias respeita o calendário BRT (não o UTC).
 *
 * Exemplo: addDaysBRT(30) em 01/Jan/2026 → '2026-01-31'
 */
export function addDaysBRT(days: number, now = new Date()): string {
  const brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  brt.setDate(brt.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(brt);
}

/**
 * Calcula o offset em milissegundos entre UTC e BRT no instante `now`.
 * Positivo = BRT está atrás de UTC (ex: UTC-3 → brtOffsetMs = 10_800_000).
 *
 * Usar para converter um Date BRT-local para o UTC correto:
 *   const utc = new Date(brtDate.getTime() + getBRTOffsetMs());
 *
 * IMPLEMENTAÇÃO via formatToParts — independente do timezone do sistema.
 * A abordagem `new Date(toLocaleString(...)).getTime()` falha quando o
 * sistema já está em UTC-3 (BRT), pois o new Date() re-adiciona o offset.
 * Aqui, extraímos os componentes BRT via Intl e os reconstruímos como
 * se fossem UTC (usando Date.UTC), obtendo o delta correto em qualquer
 * ambiente (UTC, UTC-3, UTC+0, etc.).
 */
export function getBRTOffsetMs(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  let h = get('hour');
  if (h === 24) h = 0; // some environments return 24 for midnight with hour12:false

  const brtAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
  return now.getTime() - brtAsUtc;
}
