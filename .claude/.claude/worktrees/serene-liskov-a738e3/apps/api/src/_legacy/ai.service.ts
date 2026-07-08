/**
 * @module Serviço de IA para extração de medicamentos
 * @description Usa Claude Haiku para extrair medicamentos de texto ou imagem.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MedicationExtractionResult } from '@lembrymed/shared/types';
import { logger } from '@lembrymed/shared/logger';

const anthropic = new Anthropic();

const EXTRACTION_PROMPT = `Você é um assistente especializado em extração de informações de medicamentos.

REGRAS:
1. Extraia APENAS informações explicitamente mencionadas.
2. NÃO invente dosagens ou horários não mencionados.
3. Se horário for vago: manhã=08:00, tarde=14:00, noite=20:00.
4. Normalize nomes: "losartana" → "Losartana".
5. Retorne APENAS JSON válido, sem texto adicional.

FORMATO:
{"medications":[{"name":"...","dosage":"...","times":["HH:MM"],"instructions":null}],"confidence":0.95,"notes":null}`;

/**
 * Extrai medicamentos de texto livre ou imagem
 * @param inputType - 'text' ou 'image'
 * @param content - Texto do paciente ou URL da imagem
 */
export async function extractMedications(
  inputType: 'text' | 'image',
  content: string
): Promise<MedicationExtractionResult> {
  try {
    const userContent: Anthropic.MessageParam['content'] = [];

    if (inputType === 'image') {
      // Baixar imagem e converter para base64
      const imageResponse = await fetch(content);
      const buffer = await imageResponse.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const mediaType = imageResponse.headers.get('content-type') || 'image/jpeg';

      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType as any, data: base64 },
      });
      userContent.push({
        type: 'text',
        text: 'Analise esta bula/receita e extraia todos os medicamentos com dosagem e horários.',
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Texto do paciente: "${content}"`,
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as Anthropic.TextBlock).text)
      .join('');

    // Parse JSON — strip markdown fences se houver
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as MedicationExtractionResult;

    logger.info('Medications extracted', {
      count: result.medications.length,
      confidence: result.confidence,
    });

    return result;
  } catch (error: any) {
    logger.error('Medication extraction failed', { error: error.message });
    return {
      medications: [],
      confidence: 0,
      notes: `Erro na extração: ${error.message}. Peça ao paciente para digitar manualmente.`,
    };
  }
}
