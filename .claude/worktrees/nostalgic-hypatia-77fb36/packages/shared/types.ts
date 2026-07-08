/**
 * @module Tipos compartilhados do Lembrymed
 */

/** Medicamento extraído pela IA */
export interface ExtractedMedication {
  name: string;
  dosage: string;
  times: string[];
  instructions?: string | null;
}

/** Resposta da extração de medicamentos */
export interface MedicationExtractionResult {
  medications: ExtractedMedication[];
  confidence: number;
  notes?: string | null;
}

/** Payload do webhook 360dialog */
export interface Dialog360Webhook {
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; url?: string; mime_type: string };
    document?: { id: string; url?: string; mime_type: string };
  }>;
  statuses?: Array<{
    id: string;
    status: string;
    timestamp: string;
  }>;
}

/** Payload do webhook Z-API (recebimento de mensagem) */
export interface ZAPIWebhook {
  instanceId?: string;
  messageId?: string;
  phone: string;
  fromMe: boolean;
  /** 'ReceivedCallback' para mensagens recebidas; outros valores são status/entrega */
  type?: 'ReceivedCallback' | 'DeliveryCallback' | 'ReadCallback' | 'RevokeCallback' | string;
  text?: { message: string };
  image?: { url?: string; imageUrl?: string; caption?: string };
  document?: { url?: string; documentUrl?: string; caption?: string };
  audio?: { url?: string; audioUrl?: string };
  video?: { url?: string; videoUrl?: string; caption?: string };
}

/** Resultado de envio de mensagem WhatsApp */
export interface WhatsAppSendResult {
  messages: Array<{ id: string }>;
}

/** Job de envio de lembrete */
export interface ReminderJobData {
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  medication_id: string;
  medication_name: string;
  dosage: string;
  medication_time: string;
  reminder_type: 't_minus_30' | 't_minus_5' | 't_plus_5';
  /**
   * Horário planejado do medicamento neste dia em UTC ISO.
   * Usado para preencher `reminder_logs.scheduled_for` com semântica
   * correta (quando era PARA ser enviado, não quando foi enviado).
   * Opcional para compatibilidade com jobs antigos da fila.
   */
  scheduled_for_iso?: string;
}

/** Job de alerta familiar */
export interface FamilyAlertJobData {
  patient_id: string;
  medication_id: string;
  medication_time: string;
}
