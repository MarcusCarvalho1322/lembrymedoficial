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
import { env } from '../config/env';

type WhatsAppProvider = '360dialog' | 'meta' | 'zapi' | 'twilio';

/** Timeout padrão para todas as chamadas ao provedor WhatsApp (ms).
 *  FIX (2026-05): sem timeout, um fetch pendurado bloqueia o slot de
 *  concorrência do BullMQ indefinidamente — causando backlog de lembretes.
 */
const WHATSAPP_FETCH_TIMEOUT_MS = 15_000;

/**
 * Wrapper de fetch com timeout via AbortController.
 * Lança DOMException ('AbortError') se a requisição exceder o prazo.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = WHATSAPP_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
    const response = await fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': env.DIALOG_API_KEY!,
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
    const response = await fetchWithTimeout(`${this.baseUrl}/media/${mediaId}`, {
      headers: { 'D360-API-KEY': env.DIALOG_API_KEY! },
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
    const phoneId = env.META_PHONE_NUMBER_ID || env.DIALOG_PHONE_NUMBER_ID!;
    return `https://graph.facebook.com/v18.0/${phoneId}`;
  }

  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    const token = env.META_ACCESS_TOKEN || env.DIALOG_API_KEY!;

    const response = await fetchWithTimeout(`${this.baseUrl}/messages`, {
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
    const token = env.META_ACCESS_TOKEN || env.DIALOG_API_KEY!;
    const response = await fetchWithTimeout(`https://graph.facebook.com/v18.0/${mediaId}`, {
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
    return `https://api.z-api.io/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}`;
  }

  async sendTextMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
    // Z-API espera o número no formato E.164 sem o + (ex: 5511999999999).
    // Se vier com +, remove o prefixo. Se já estiver sem +, passa direto.
    const phoneFormatted = phone.startsWith('+') ? phone.slice(1) : phone;

    const response = await fetchWithTimeout(`${this.baseUrl}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ZAPI_CLIENT_TOKEN && { 'Client-Token': env.ZAPI_CLIENT_TOKEN }),
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
    const accountSid = env.TWILIO_ACCOUNT_SID!;
    const authToken = env.TWILIO_AUTH_TOKEN!;
    const from = env.TWILIO_WHATSAPP_FROM || 'whatsapp:+141****8886'; // Sandbox padrão

    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:+${phone}`,
      Body: message,
    });

    const response = await fetchWithTimeout(
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
  const provider = (env.WHATSAPP_PROVIDER || '360dialog') as WhatsAppProvider;

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
// CIRCUIT BREAKER — proteção contra falha em cascata
// ═══════════════════════════════════════════════════════════
//
// Estados:
//   CLOSED  → operação normal
//   OPEN    → falhas consecutivas atingiram o limite; falha rápida sem tentar o API
//   HALF_OPEN → após o timeout de recuperação; tenta 1 request de teste
//
// Configuração padrão:
//   failureThreshold = 5 falhas em 60s → OPEN
//   recoveryTimeoutMs = 60_000ms → tenta HALF_OPEN
//
// Escopo: singleton por processo (compartilhado entre todas as instâncias de
// WhatsAppClient do mesmo processo).

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

const circuitBreaker = {
  state: 'CLOSED' as CircuitState,
  failureCount: 0,
  failureWindowStart: 0,
  openedAt: 0,
  readonly: {
    failureThreshold: 5,
    failureWindowMs: 60_000,
    recoveryTimeoutMs: 60_000,
  },
};

function recordSuccess(): void {
  circuitBreaker.failureCount = 0;
  if (circuitBreaker.state !== 'CLOSED') {
    logger.info('WhatsApp circuit breaker: CLOSED (recovered)');
    circuitBreaker.state = 'CLOSED';
  }
}

function recordFailure(): void {
  const now = Date.now();
  const { failureThreshold, failureWindowMs, recoveryTimeoutMs } = circuitBreaker.readonly;

  // Reset janela se mais de failureWindowMs passou
  if (now - circuitBreaker.failureWindowStart > failureWindowMs) {
    circuitBreaker.failureCount = 0;
    circuitBreaker.failureWindowStart = now;
  }

  circuitBreaker.failureCount++;

  if (circuitBreaker.failureCount >= failureThreshold && circuitBreaker.state === 'CLOSED') {
    circuitBreaker.state = 'OPEN';
    circuitBreaker.openedAt = now;
    logger.error('WhatsApp circuit breaker: OPEN', {
      failures: circuitBreaker.failureCount,
      windowMs: failureWindowMs,
    });
  }

  if (circuitBreaker.state === 'HALF_OPEN') {
    // Tentativa no HALF_OPEN falhou — volta para OPEN
    circuitBreaker.state = 'OPEN';
    circuitBreaker.openedAt = now;
    logger.warn('WhatsApp circuit breaker: back to OPEN (half-open test failed)');
  }
}

function isCircuitOpen(): boolean {
  const now = Date.now();
  const { recoveryTimeoutMs } = circuitBreaker.readonly;

  if (circuitBreaker.state === 'OPEN') {
    if (now - circuitBreaker.openedAt >= recoveryTimeoutMs) {
      circuitBreaker.state = 'HALF_OPEN';
      logger.info('WhatsApp circuit breaker: HALF_OPEN (testing recovery)');
      return false; // permite 1 tentativa de teste
    }
    return true; // ainda OPEN — falha rápida
  }

  return false;
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
    // Circuit breaker — falha rápida se API estiver fora
    if (isCircuitOpen()) {
      const err = new Error('WhatsApp API circuit breaker OPEN — skipping call');
      logger.warn('Circuit breaker open: skipping WhatsApp call', {
        phone: phone.substring(0, 8) + '****',
        openedAt: new Date(circuitBreaker.openedAt).toISOString(),
      });
      throw err;
    }

    try {
      const result = await this.provider.sendTextMessage(phone, message);
      recordSuccess();
      logger.info('WhatsApp sent', {
        phone: phone.substring(0, 8) + '****',
        messageId: result.messages?.[0]?.id,
        provider: env.WHATSAPP_PROVIDER || '360dialog',
      });
      return result;
    } catch (error: any) {
      recordFailure();
      logger.error('WhatsApp send failed', {
        phone: phone.substring(0, 8) + '****',
        provider: env.WHATSAPP_PROVIDER || '360dialog',
        error: error.message,
        circuitState: circuitBreaker.state,
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

  /** Expõe estado atual do circuit breaker (para o endpoint /metrics) */
  static getCircuitState(): { state: CircuitState; failures: number; openedAt?: string } {
    return {
      state: circuitBreaker.state,
      failures: circuitBreaker.failureCount,
      ...(circuitBreaker.state !== 'CLOSED'
        ? { openedAt: new Date(circuitBreaker.openedAt).toISOString() }
        : {}),
    };
  }
}
