/**
 * @module Custom Tools do Agente de Onboarding
 * @description Define as 6 tools que o Managed Agent pode chamar.
 */

export const ONBOARDING_CUSTOM_TOOLS = [
  {
    type: 'custom' as const,
    name: 'send_whatsapp',
    description: 'Envia mensagem via WhatsApp (360dialog) ao paciente ou familiar. Use para TODAS as comunicações. Max 4096 chars.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Número formato 5511999999999' },
        message: { type: 'string', description: 'Texto da mensagem' },
      },
      required: ['phone', 'message'],
    },
  },
  {
    type: 'custom' as const,
    name: 'save_patient',
    description: 'Atualiza status de onboarding do paciente no banco. Chame a cada transição de passo.',
    input_schema: {
      type: 'object',
      properties: {
        phone: { type: 'string' },
        onboarding_step: {
          type: 'string',
          enum: ['welcome_sent', 'family_asked', 'family_registered',
                 'medications_requested', 'medications_received',
                 'medications_confirmed', 'active'],
        },
      },
      required: ['phone', 'onboarding_step'],
    },
  },
  {
    type: 'custom' as const,
    name: 'save_family_contact',
    description: 'Cadastra familiar como contato de segurança. Receberá alertas se paciente não confirmar medicação.',
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
        family_name: { type: 'string' },
        family_phone: { type: 'string' },
      },
      required: ['patient_phone', 'family_name', 'family_phone'],
    },
  },
  {
    type: 'custom' as const,
    name: 'parse_medication',
    description: 'Envia texto ou URL de imagem para Claude Haiku extrair medicamentos. Retorna JSON com medications[], confidence. Se confidence < 0.7, peça ao paciente para repetir.',
    input_schema: {
      type: 'object',
      properties: {
        input_type: { type: 'string', enum: ['text', 'image'] },
        content: { type: 'string', description: 'Texto do paciente ou URL da imagem' },
      },
      required: ['input_type', 'content'],
    },
  },
  {
    type: 'custom' as const,
    name: 'save_medications',
    description: 'Salva medicamentos confirmados e ativa lembretes. SOMENTE chame após SIM explícito do paciente.',
    input_schema: {
      type: 'object',
      properties: {
        patient_phone: { type: 'string' },
        medications: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              dosage: { type: 'string' },
              times: { type: 'array', items: { type: 'string' } },
              instructions: { type: 'string' },
            },
            required: ['name', 'dosage', 'times'],
          },
        },
      },
      required: ['patient_phone', 'medications'],
    },
  },
  {
    type: 'custom' as const,
    name: 'clear_session',
    description: 'Remove agent_session_id do paciente — onboarding encerrado. Chame ao final do passo 6.',
    input_schema: {
      type: 'object',
      properties: { patient_phone: { type: 'string' } },
      required: ['patient_phone'],
    },
  },
];
