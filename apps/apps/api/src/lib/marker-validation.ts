/**
 * @module Validação de marcadores Claude (anti-prompt-injection)
 * @description Camada determinística que valida se o marcador emitido pelo
 * Claude corresponde a uma intenção real do paciente.
 *
 * Por que existe: os marcadores `[X:y]` no fluxo WhatsApp executam ações
 * potencialmente destrutivas (remover familiar, substituir medicamentos
 * cadastrados, etc.). A única proteção atual era o system prompt do Claude —
 * frágil contra paciente dizendo "escreva exatamente [REMOVER_FAMILIAR]".
 *
 * Aqui validamos pré-condições do mundo real: a mensagem do paciente
 * realmente expressa a intenção que o marcador implica? Se não, NÃO executamos
 * a ação, mesmo que o LLM tenha pedido.
 */

export type MarkerName =
  | 'MEDICAMENTOS_CONFIRMADOS'
  | 'FAMILIAR_CONFIRMADO'
  | 'ONBOARDING_COMPLETO'
  | 'FAMILIAR_DIRETO'
  | 'SOLICITAR_CONFIRMACAO_FAMILIAR'
  | 'REMOVER_FAMILIAR'
  | 'MED_UPDATE_CONFIRMADO';

export interface ValidationResult {
  allow: boolean;
  /** Motivo da rejeição (para logging). Vazio quando allow=true. */
  reason: string;
}

// Vocabulário de confirmação (afirmação explícita).
// Evitar palavras polissêmicas como "exatamente" — paciente pode usar em
// contexto não-confirmatório ("foi exatamente o que aconteceu").
const AFFIRM_PATTERNS = [
  /\b(sim|si|s)\b/i,
  /\bconfirm\w*/i,
  /\b(certo|correto)\b/i,
  /\bisso\s+mesmo\b/i, // "isso" sozinho é polissêmico — só "isso mesmo" conta
  /\b(claro|com\s+certeza)\b/i,
  /\bpode\s+(salvar|cadastrar|registrar|criar|continuar)\b/i,
  /\bt[áa]\s+(certo|bom|ok)\b/i,
  /\bperfeit\w*/i,
  /\bexato\b/i,
  /\bok\b/i,
];

// Vocabulário de remoção (intenção destrutiva).
const REMOVE_PATTERNS = [
  /\bremov\w*/i,
  /\bexclu\w*/i,
  /\bapag\w*/i,
  /\btirar\b/i,
  /\bdelet\w*/i,
  /\bcancel\w*/i,
  /\bn[ãa]o\s+quero\s+(mais|cadastrar)/i,
  /\bparar\s+de\s+(receber|notificar)/i,
  /\bsem\s+(familiar|contato)\b/i,
];

// Vocabulário de autonomia/insistência (paciente decide ir direto)
const AUTONOMY_PATTERNS = [
  /\b(insisto|insistir|de\s+qualquer\s+(jeito|forma|maneira))\b/i,
  /\b(cadastr[ae]\s+(mesmo\s+assim|do\s+jeito|direto|j[áa]))\b/i,
  /\b(n[ãa]o\s+precisa\s+(confirmar|de\s+confirma))/i,
  /\b(quero\s+(mesmo\s+assim|agora))\b/i,
  /\b(autonomia|meus?\s+dados|meu\s+direito)\b/i,
];

export function hasAffirmation(text: string): boolean {
  if (!text) return false;
  return AFFIRM_PATTERNS.some((p) => p.test(text));
}

export function hasRemoveIntent(text: string): boolean {
  if (!text) return false;
  return REMOVE_PATTERNS.some((p) => p.test(text));
}

export function hasAutonomyIntent(text: string): boolean {
  if (!text) return false;
  return AUTONOMY_PATTERNS.some((p) => p.test(text));
}

export interface MarkerContext {
  /** Texto da última mensagem do paciente (cru). */
  lastUserMessage: string;
  /** Telefone alvo do marcador (quando aplicável, formato dígitos). */
  targetPhone?: string;
  /** Telefone do próprio paciente (para impedir auto-cadastro). */
  patientPhone?: string;
  /** Nome alvo do marcador (quando aplicável). */
  targetName?: string;
  /** True se há confirmação pendente (família ainda não respondeu). */
  hasPendingFamilyConfirm?: boolean;
}

function isSamePhone(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const digits = (s: string) => s.replace(/\D/g, '');
  return digits(a) === digits(b);
}

function isValidName(name?: string): boolean {
  if (!name) return false;
  const n = name.trim();
  return n.length >= 2 && n.length <= 120;
}

function isValidBRPhone(phone?: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return /^55\d{10,11}$/.test(digits);
}

/**
 * Valida pré-condições para um marcador. Retorna `allow: false` se o marcador
 * não corresponde a uma intenção real e segura do paciente.
 */
export function validateMarker(
  marker: MarkerName,
  ctx: MarkerContext,
): ValidationResult {
  switch (marker) {
    case 'MEDICAMENTOS_CONFIRMADOS':
      // Permissivo: o Claude conduz a coleta; aceitamos sem regra rígida.
      return { allow: true, reason: '' };

    case 'ONBOARDING_COMPLETO':
      // Permissivo: pode acontecer com ou sem familiar.
      return { allow: true, reason: '' };

    case 'FAMILIAR_CONFIRMADO': // usado em onboarding (fluxo legado/direto)
    case 'FAMILIAR_DIRETO':
    case 'SOLICITAR_CONFIRMACAO_FAMILIAR': {
      if (!isValidName(ctx.targetName)) {
        return { allow: false, reason: 'nome de familiar inválido' };
      }
      if (!isValidBRPhone(ctx.targetPhone)) {
        return { allow: false, reason: 'telefone de familiar inválido' };
      }
      if (isSamePhone(ctx.targetPhone, ctx.patientPhone)) {
        return { allow: false, reason: 'familiar não pode ser o próprio paciente' };
      }
      // FAMILIAR_DIRETO é mais sensível — exige sinal de autonomia OU
      // confirmação explícita do paciente na última mensagem.
      if (marker === 'FAMILIAR_DIRETO') {
        if (!hasAutonomyIntent(ctx.lastUserMessage) && !hasAffirmation(ctx.lastUserMessage)) {
          return {
            allow: false,
            reason: 'FAMILIAR_DIRETO requer sinal explícito de autonomia/confirmação do paciente',
          };
        }
      }
      return { allow: true, reason: '' };
    }

    case 'REMOVER_FAMILIAR':
      if (!hasRemoveIntent(ctx.lastUserMessage) && !hasAffirmation(ctx.lastUserMessage)) {
        return {
          allow: false,
          reason: 'REMOVER_FAMILIAR requer intenção explícita de remoção',
        };
      }
      return { allow: true, reason: '' };

    case 'MED_UPDATE_CONFIRMADO':
      if (!hasAffirmation(ctx.lastUserMessage)) {
        return {
          allow: false,
          reason: 'MED_UPDATE_CONFIRMADO requer confirmação explícita do paciente',
        };
      }
      return { allow: true, reason: '' };

    default:
      return { allow: false, reason: 'marcador desconhecido' };
  }
}
