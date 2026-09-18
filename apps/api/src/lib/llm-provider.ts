/**
 * @module LLM Provider — Abstração multi-backend
 * @description Suporte a DeepSeek V3 (recomendado, OpenAI-compatível) e
 * Anthropic Claude (fallback, mantido como opção).
 *
 * Seleção via env var LLM_PROVIDER:
 *   - 'deepseek' (default) — DeepSeek V3 via OpenAI SDK
 *   - 'anthropic'          — Claude via Anthropic SDK
 *
 * Custo comparativo (por 1M tokens):
 *   DeepSeek V3: $0.27 input (cache) / $1.10, $4.40 output
 *   Claude Sonnet 4: $3.00 input / $15.00 output
 *   Economia: ~70-85%
 *
 * Migrado de Anthropic Claude para DeepSeek V3 em 2026-07-07
 * (Arquitetura Centralizada — auditoria Hermes).
 */

import { env } from '../config/env';
import { logger } from '@lembrymed/shared/logger';

// ═══════════════════════════════════════════════════════════
// TIPOS COMUNS
// ═══════════════════════════════════════════════════════════

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ImageBlock {
  type: 'image';
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

export interface PdfBlock {
  type: 'pdf';
  base64: string;
}

export type MediaBlock = ImageBlock | PdfBlock;

export interface ChatOptions {
  /** System prompt (Anthropic: top-level system, OpenAI/DeepSeek: primeira mensagem system) */
  system?: string;
  /** Modelo a usar (default: deepseek-chat para DeepSeek, claude-sonnet-4-6 para Anthropic) */
  model?: string;
  /** Max tokens de output */
  maxTokens?: number;
  /** Blocos de mídia para anexar à última mensagem do usuário */
  media?: MediaBlock[];
}

export interface ChatResponse {
  text: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}

// ═══════════════════════════════════════════════════════════
// INTERFACE DO PROVIDER
// ═══════════════════════════════════════════════════════════

interface LlmProvider {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

// ═══════════════════════════════════════════════════════════
// BACKEND: DEEPSEEK V3 (OpenAI SDK)
// ═══════════════════════════════════════════════════════════

class DeepSeekProvider implements LlmProvider {
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const apiKey = env.DEEPSEEK_API_KEY;
    const baseUrl = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    const model = options.model || 'deepseek-chat';

    // Construir array de mensagens OpenAI
    const openaiMessages: Array<{ role: string; content: any }> = [];

    // System prompt como primeira mensagem
    if (options.system) {
      openaiMessages.push({ role: 'system', content: options.system });
    }

    // Converter mensagens
    for (const msg of messages) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    // Se há mídia, anexar à última mensagem do usuário
    if (options.media && options.media.length > 0) {
      const lastUserIdx = openaiMessages.map((m, i) => m.role === 'user' ? i : -1).filter(i => i >= 0).pop();
      if (lastUserIdx !== undefined) {
        const contentParts: any[] = [{ type: 'text', text: openaiMessages[lastUserIdx].content }];
        for (const media of options.media) {
          if (media.type === 'image') {
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${media.mediaType};base64,${media.base64}` },
            });
          }
          // DeepSeek V3 não suporta PDF nativo; converteríamos para imagens ou texto
          // Por enquanto, skip PDF para DeepSeek
        }
        openaiMessages[lastUserIdx].content = contentParts;
      }
    }

    logger.debug('LLM DeepSeek call', {
      model,
      msgCount: openaiMessages.length,
      hasSystem: !!options.system,
      hasMedia: (options.media?.length ?? 0) > 0,
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        max_tokens: options.maxTokens ?? 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error ${response.status}: ${errBody.substring(0, 500)}`);
    }

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content ?? '';

    return {
      text,
      model: data.model || model,
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      } : undefined,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// BACKEND: ANTHROPIC CLAUDE (fallback)
// ═══════════════════════════════════════════════════════════

class AnthropicProvider implements LlmProvider {
  private anthropic: any = null;

  private getClient(): any {
    if (!this.anthropic) {
      // Dynamic import para evitar carregar o SDK se não for usado
      const Anthropic = require('@anthropic-ai/sdk').default;
      this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return this.anthropic;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const client = this.getClient();
    const model = options.model || 'claude-sonnet-4-6';

    // Converter mensagens para formato Anthropic
    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Construir content blocks se houver mídia
    const lastMsg = anthropicMessages[anthropicMessages.length - 1];
    if (options.media && options.media.length > 0 && lastMsg) {
      const contentBlocks: any[] = [{ type: 'text', text: lastMsg.content }];
      for (const media of options.media) {
        if (media.type === 'image') {
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: media.mediaType, data: media.base64 },
          });
        } else if (media.type === 'pdf') {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: media.base64 },
          });
        }
      }
      lastMsg.content = contentBlocks as any;
    }

    logger.debug('LLM Anthropic call', {
      model,
      msgCount: anthropicMessages.length,
      hasSystem: !!options.system,
      hasMedia: (options.media?.length ?? 0) > 0,
    });

    const response = await client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 1024,
      system: options.system,
      messages: anthropicMessages,
    });

    const text = response.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text as string)
      .join('');

    return {
      text,
      model: response.model || model,
      usage: response.usage ? {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      } : undefined,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════

function createProvider(): LlmProvider {
  const provider = env.LLM_PROVIDER || 'deepseek';

  switch (provider) {
    case 'anthropic':
      logger.info('LLM Provider: Anthropic Claude');
      return new AnthropicProvider();
    case 'deepseek':
    default:
      logger.info('LLM Provider: DeepSeek V3');
      return new DeepSeekProvider();
  }
}

// Singleton
let _provider: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (!_provider) {
    _provider = createProvider();
  }
  return _provider;
}

/**
 * Atalho: chama o provider com os parâmetros dados e retorna só o texto.
 * Função de conveniência que encapsula toda a lógica de backend.
 */
export async function llmChat(
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<ChatResponse> {
  return getLlmProvider().chat(messages, options);
}
