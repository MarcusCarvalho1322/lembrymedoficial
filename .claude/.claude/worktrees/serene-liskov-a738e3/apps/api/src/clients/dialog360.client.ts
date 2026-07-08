/**
 * @module Cliente WhatsApp — Lembrymed v2
 * @description Wrapper unificado para múltiplos provedores WhatsApp Business.
 * Troque de provedor com uma variável de ambiente: WHATSAPP_PROVIDER
 *
 * Provedores suportados:
 *   - "360dialog"   → API oficial 360dialog (produção)
 *   - "meta"        → Meta Cloud API direta (grátis 1k conv/mês, ideal para testes)
 *   - "zapi"        → Z-API (Brasil, ativação imediata, ~R$49/mês)
 *   - "twilio"      → Twilio WhatsApp Sandbox (testes rápidos)
 */

import type { WhatsAppSendResult } from '@lembrymed/shared/types';
import { logger } from '@lembrymed/shared/logger';

type WhatsAppProvider = '360dialog' | 'meta' | 'zapi' | 'twilio';

// ═══════════════════════════════════════════════════════════
// INTERFACE ÚNICA — todos os provedores implementam isso
// ═══════════════════════════════════════════════════════════

interface IWhatsAppProvider {
  sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult>;
  getMediaUrl(mediaId: string): Promise<string>;
}

// ═══════════════════════════════════════════════════════════
// PROVEDOR 1: 360dialog (PRODUÇÃO — BSP Oficial Meta)
// Env: DIALOG_API_KEY, DIALOG_PHONE_NUMBER_ID
// ═══════════════════════════════════════════════════════════

class Dialog360Provider implements IWhatsAppProvider {
  private baseUrl = 'https://waba.360dialog.io/v1';

  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': process.env.DIALOG_API_KEY!,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`360dialog ${response.status}: ${err}`);
    }
    return response.json() as Promise<WhatsAppSendResult>;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/media/${mediaId}`, {
      headers: { 'D360-API-KEY': process.env.DIALOG_API_KEY! },
    });
    if (!response.ok) throw new Error(`360dialog media ${response.status}`);
    const data = await response.json() as { url: string };
    return data.url;
  }
}

// ═══════════════════════════════════════════════════════════
// PROVEDOR 2: Meta Cloud API (TESTES — Grátis 1k conv/mês)
//
// Como configurar (15 minutos):
//   1. developers.facebook.com → Criar app → WhatsApp Business
//   2. Adicionar número de teste (aparece imediatamente)
//   3. Copiar "Temporary access token" (válido 24h) ou gerar token permanente
//   4. Copiar "Phone Number ID"
//
// Env: META_ACCESS_TOKEN, META_PHONE_NUMBER_ID
// ═══════════════════════════════════════════════════════════

class MetaCloudProvider implements IWhatsAppProvider {
  private get baseUrl() {
    const phoneId = process.env.META_PHONE_NUMBER_ID || process.env.DIALOG_PHONE_NUMBER_ID!;
    return `https://graph.facebook.com/v18.0/${phoneId}`;
  }

  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    const token = process.env.META_ACCESS_TOKEN || process.env.DIALOG_API_KEY!;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: message },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Meta Cloud API ${response.status}: ${err}`);
    }
    return response.json() as Promise<WhatsAppSendResult>;
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    const token = process.env.META_ACCESS_TOKEN || process.env.DIALOG_API_KEY!;
    const response = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Meta media ${response.status}`);
    const data = await response.json() as { url: string };
    return data.url;
  }
}

// ═══════════════════════════════════════════════════════════
// PROVEDOR 3: Z-API (BRASIL — Ativação imediata, ~R$49/mês)
//
// Como configurar (5 minutos):
//   1. z-api.io → Criar conta → Criar instância
//   2. Escanear QR Code com WhatsApp
//   3. Copiar Instance ID e Token
//
// Env: ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN (opcional)
// ═══════════════════════════════════════════════════════════

class ZAPIProvider implements IWhatsAppProvider {
  private get baseUrl() {
    return `https://api.z-api.io/instances/${process.env.ZAPI_INSTANCE_ID}/token/${process.env.ZAPI_TOKEN}`;
  }

  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    // Z-API espera o número no formato E.164 sem o + (ex: 5511999999999).
    // Se vier com +, remove o prefixo. Se já estiver sem +, passa direto.
    const phoneFormatted = phone.startsWith('+') ? phone.slice(1) : phone;

    const response = await fetch(`${this.baseUrl}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ZAPI_CLIENT_TOKEN && { 'Client-Token': process.env.ZAPI_CLIENT_TOKEN }),
      },
      body: JSON.stringify({
        phone: phoneFormatted,
        message,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Z-API ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    // Normalizar resposta para o formato padrão
    return {
      messages: [{ id: data.zaapId || data.messageId || 'zapi-msg' }],
    };
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    // Z-API envia a URL da mídia diretamente no webhook
    return mediaId; // mediaId já é a URL no Z-API
  }
}

// ═══════════════════════════════════════════════════════════
// PROVEDOR 4: Twilio (SANDBOX — Testes em 5 minutos, grátis)
//
// Como configurar (5 minutos):
//   1. twilio.com/console → WhatsApp Sandbox
//   2. Enviar "join [palavra]" para +1 415 523 8886 no WhatsApp
//   3. Copiar Account SID e Auth Token
//
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
// ═══════════════════════════════════════════════════════════

class TwilioProvider implements IWhatsAppProvider {
  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'; // Sandbox padrão

    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:+${phone}`,
      Body: message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Twilio ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    return {
      messages: [{ id: data.sid || 'twilio-msg' }],
    };
  }

  async getMediaUrl(mediaId: string): Promise<string> {
    return mediaId;
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY — seleciona o provedor pela variável WHATSAPP_PROVIDER
// ═══════════════════════════════════════════════════════════

function createProvider(): IWhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER || '360dialog') as WhatsAppProvider;

  switch (provider) {
    case 'meta':
      logger.info('WhatsApp provider: Meta Cloud API (testes)');
      return new MetaCloudProvider();
    case 'zapi':
      logger.info('WhatsApp provider: Z-API (Brasil)');
      return new ZAPIProvider();
    case 'twilio':
      logger.info('WhatsApp provider: Twilio Sandbox (testes)');
      return new TwilioProvider();
    case '360dialog':
    default:
      logger.info('WhatsApp provider: 360dialog (produção)');
      return new Dialog360Provider();
  }
}

// ═══════════════════════════════════════════════════════════
// CLASSE PÚBLICA — interface única para todo o projeto
// ═══════════════════════════════════════════════════════════

export class WhatsAppClient {
  private provider: IWhatsAppProvider;

  constructor() {
    this.provider = createProvider();
  }

  /**
   * Envia mensagem de texto via WhatsApp.
   * O provedor é selecionado automaticamente pela env WHATSAPP_PROVIDER.
   * @param phone - Número no formato E.164: 5511999999999
   * @param message - Texto da mensagem
   */
  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    try {
      const result = await this.provider.sendTextMessage(phone, message);
      logger.info('WhatsApp sent', {
        phone: phone.substring(0, 8) + '****',
        messageId: result.messages?.[0]?.id,
        provider: process.env.WHATSAPP_PROVIDER || '360dialog',
      });
      return result;
    } catch (error: any) {
      logger.error('WhatsApp send failed', {
        phone: phone.substring(0, 8) + '****',
        provider: process.env.WHATSAPP_PROVIDER || '360dialog',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Obtém URL de mídia (imagem/documento) pelo ID.
   */
  async getMediaUrl(mediaId: string): Promise<string> {
    return this.provider.getMediaUrl(mediaId);
  }
}
