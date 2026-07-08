/**
 * @module PII Masking helpers
 * @description Utilitários para mascarar dado pessoal sensível em logs.
 *
 * LGPD Art. 46: "medidas de segurança, técnicas e administrativas".
 * Minimizar exposição de PII em logs reduz superfície de vazamento
 * por cópia indevida de snapshots de logs / compartilhamento com
 * ferramentas terceiras (Railway logs, Sentry).
 */

/** Mascara telefone: 5511999999999 → 5511****9999 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 6) return '****';
  const head = digits.slice(0, 4);
  const tail = digits.slice(-4);
  return `${head}****${tail}`;
}

/** Mascara email: joao.silva@bizzia.com.br → j***@bizzia.com.br */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '';
  const str = String(email);
  const at = str.indexOf('@');
  if (at < 1) return '***';
  const local = str.slice(0, at);
  const domain = str.slice(at + 1);
  return `${local[0]}***@${domain}`;
}

/** Mascara CPF: 123.456.789-10 → ***.***.789-10 */
export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return '';
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length !== 11) return '***';
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Mascara nome: "João da Silva" → "João d. S." */
export function maskName(name: string | null | undefined): string {
  if (!name) return '';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0][0]}${'*'.repeat(Math.max(0, parts[0].length - 1))}`;
  return `${parts[0]} ${parts.slice(1).map((p) => p[0] + '.').join(' ')}`;
}
