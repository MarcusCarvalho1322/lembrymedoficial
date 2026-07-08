/**
 * @module Phone helpers (Brasil)
 * @description Funções puras de normalização e validação de telefones
 * brasileiros. Extraído para ser testável sem precisar importar o router
 * inteiro do webhook.
 */

/**
 * Gera candidatos de telefone para lookup de paciente.
 *
 * A portabilidade do 9º dígito em números móveis brasileiros significa que
 * um mesmo paciente pode ter sido cadastrado como `554999999999` (sem 9)
 * ou `5549999999999` (com 9). A Z-API pode entregar em qualquer formato.
 *
 * Ordem (primeiro match ganha — `patients.phone UNIQUE` garante 1 match):
 *   1. Número exatamente como veio
 *   2. Com prefixo 55 se não tiver
 *   3. Com 9 inserido (cobre cadastro antigo que virou 9-dígito)
 *   4. Sem 9 (cobre cadastro novo que ainda está no 8-dígito)
 */
export function buildPhoneCandidates(phone: string): string[] {
  const candidates = new Set<string>();
  candidates.add(phone);
  const withCC = phone.startsWith('55') ? phone : '55' + phone;
  candidates.add(withCC);
  const withoutCC = withCC.slice(2);
  if (withoutCC.length === 10) {
    candidates.add('55' + withoutCC.slice(0, 2) + '9' + withoutCC.slice(2));
  }
  if (withoutCC.length === 11) {
    candidates.add('55' + withoutCC.slice(0, 2) + withoutCC.slice(3));
  }
  return [...candidates];
}

/**
 * Valida telefone BR extraído via IA (Claude) antes de persistir em
 * family_contacts. Aceita apenas formato 55+DDD+8 ou 9 dígitos.
 * Retorna telefone limpo (só dígitos) ou null se inválido.
 */
export function validateFamilyPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digits)) return null;
  return digits;
}
