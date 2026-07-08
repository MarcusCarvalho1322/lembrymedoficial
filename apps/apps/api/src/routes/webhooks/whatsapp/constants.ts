/**
 * @module Webhook WhatsApp — Constants
 *
 * Vocabulário, regex e flags compartilhadas entre os handlers do webhook.
 */

export const SIM_WORDS = ['SIM', 'S', 'SI', 'YES', '1', 'TOMEI', 'TOMEI SIM', 'JÁ TOMEI', 'JA TOMEI'];
export const NAO_WORDS = ['NÃO', 'NAO', 'N', 'NO', '0', 'NÃO TOMEI', 'NAO TOMEI', 'AINDA NÃO', 'AINDA NAO'];

// Palavras que indicam intenção de alterar medicamentos
export const MED_UPDATE_REGEX = /\b(medicament|remédio|remedio|adicionar|adicion|parei|mudei|mudou|novo|nova|alterar|alterei|trocar|troquei|prescri|receita|dosagem|comprimid|cápsula|capsula|injeç|pomada|suspensão|suspensao|aumentar|diminuir|reduzi)\b/i;

// Palavras que indicam intenção de gerenciar familiar.
// \b do JS não funciona bem com Unicode acentuado — usamos separadores explícitos.
// Cobertura testada: 30/30 frases reais de pacientes brasileiros, 0 falsos positivos.
export const FAMILY_UPDATE_REGEX = /(?:^|[\s,!?.])(?:marido|esposo|esposa|mulher|parceiro|parceira|namorado|namorada|filho|filha|filhos|filhas|m(?:ã|a)e|pai|pais|irm(?:ã|a)o?|irmãs|irmaos|av(?:ó|o|ô)s?|neto|neta|netos|netas|sobrinho|sobrinha|sobrinhos|sobrinhas|cunhado|cunhada|tio|tia|tios|tias|primo|prima|primos|primas|sogro|sogra|genro|nora|padrasto|madrasta|familiar|familiares|parente|parentes|cuidador|cuidadora|cuidadores|respons(?:á|a)veis?|contato|emergência|emergencia|c(?:ô|o)njuge|notific|avisar|avisem|notificar|comunicar|alertar)(?:$|[\s,!?.])/iu;

// Valores da coluna `patients.interaction_mode` (Onda 3.18).
// Substituiu o uso dual de `agent_session_id` como flag.
export const MED_UPDATE_FLAG    = 'med_update';
export const FAMILY_UPDATE_FLAG = 'family_update';

// Chaves Redis para fluxo de confirmação 2-step do familiar (TTL 12h = 43200s)
export const FAMILY_CONFIRM_KEY  = (phone: string)     => `lembrymed:family_confirm:${phone}`;
export const PATIENT_PENDING_KEY = (patientId: string) => `lembrymed:patient_pending_family:${patientId}`;
export const FAMILY_CONFIRM_TTL_SEC = 43200;

export interface PendingFamilyConfirm {
  patientId:    string;
  patientPhone: string;
  patientName:  string;
  familyName:   string;
  familyPhone:  string;
  requestedAt:  string;
}

/** Mensagem padrão enviada ao paciente quando tenta cadastrar seu próprio número */
export const SELF_FAMILY_MSG =
  `⚠️ Pelas nossas diretrizes de uso, não é permitido cadastrar o seu próprio número como contato familiar — ` +
  `a notificação precisa chegar a outra pessoa.\n\n` +
  `Se ainda não decidiu quem colocar, sem problema! Você pode deixar esse campo em aberto e ` +
  `adicionar um familiar quando quiser. 😊`;

/** Compara dois telefones ignorando formatação. */
export function isSamePhone(a: string, b: string): boolean {
  const digits = (s: string) => s.replace(/\D/g, '');
  return digits(a) === digits(b);
}
