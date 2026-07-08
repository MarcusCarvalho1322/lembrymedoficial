/**
 * @module Webhook WhatsApp — Extração e persistência de medicamentos
 *
 * Compartilhado entre os fluxos de onboarding e med_update. Recebe um
 * histórico de conversa em PT-BR, chama Claude Haiku para extrair lista
 * estruturada de medicamentos (nome, dosagem, horários), valida e faz
 * batch insert atômico em `medications`.
 *
 * O driver neon-http não suporta BEGIN/COMMIT multi-statement — atomicidade
 * vem do INSERT múltiplo único no PostgreSQL.
 */

import { db, medications } from '@lembrymed/database';
import { logger } from '@lembrymed/shared/logger';
import { invalidateAndSync } from '../../../../lib/med-schedule-cache';
import { llmChat } from '../../../../lib/llm-provider';

interface ExtractedMedication {
  name: string;
  dosage: string;
  times: string[];
  instructions?: string | null;
}

export async function extractAndSaveMedications(
  patient: { id: string; fullName: string; phone: string },
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  context: 'onboarding' | 'med_update',
): Promise<void> {
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'PACIENTE' : 'ASSISTENTE'}: ${m.content}`)
    .join('\n');

  const extractionPrompt = `Você é um extrator de dados de medicamentos. Analise a conversa e extraia TODOS os medicamentos que o paciente CONFIRMOU que irá tomar.

Retorne SOMENTE um array JSON válido, sem markdown, sem explicações:
[
  {
    "name": "nome do medicamento",
    "dosage": "dosagem (ex: 50mg, 500mg, 10ml)",
    "times": ["HH:MM", "HH:MM"],
    "instructions": "instruções específicas ou null"
  }
]

CONVERSÃO DE HORÁRIOS (formato 24h obrigatório):
- "de manhã" / "ao acordar"      → "07:00"
- "ao meio-dia" / "no almoço"    → "12:00"
- "à tarde"                       → "15:00"
- "à noite" / "antes de dormir"  → "21:00"
- "a cada 8 horas" (padrão)      → ["00:00", "08:00", "16:00"]
- "a cada 8 horas" (desde manhã) → ["07:00", "15:00", "23:00"]
- "a cada 12 horas"              → ["07:00", "19:00"]
- "a cada 6 horas"               → ["06:00", "12:00", "18:00", "00:00"]
- Horários explícitos (7h, 21h, 07:30) → converter para HH:MM

REGRAS:
- Inclua APENAS medicamentos confirmados pelo paciente
- Não inclua medicamentos que o paciente disse ter parado
- Se dosagem não mencionada, use "Não especificada"
- Consolide o mesmo medicamento em um único objeto
- Retorne [] se nenhum medicamento confirmado

Conversa:
${conversationText}`;

  let extracted: ExtractedMedication[] = [];

  try {
    const response = await llmChat([{ role: 'user', content: extractionPrompt }], {
      maxTokens: 1024,
    });

    const rawJson = response.text;

    const jsonMatch = rawJson.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error(`JSON não encontrado: ${rawJson.substring(0, 200)}`);

    extracted = JSON.parse(jsonMatch[0]) as ExtractedMedication[];
    if (!Array.isArray(extracted)) throw new Error('Resposta não é array');

    logger.info('Medicamentos extraídos', {
      patientId: patient.id, context, count: extracted.length,
      names: extracted.map((m) => m.name),
    });
  } catch (err: any) {
    logger.error('Falha extração Haiku', { error: err.message, patientId: patient.id, context });
    return;
  }

  if (extracted.length === 0) {
    logger.warn('Nenhum medicamento extraído', { patientId: patient.id, context });
    return;
  }

  // Validar e normalizar a lista ANTES de qualquer insert (atomicidade).
  const valuesToInsert: typeof medications.$inferInsert[] = [];
  for (const med of extracted) {
    const validTimes = (med.times || [])
      .filter((t) => typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t.trim()))
      .map((t) => {
        const [h, m] = t.trim().split(':');
        return `${h.padStart(2, '0')}:${m}`;
      });

    if (validTimes.length === 0) {
      logger.warn('Medicamento sem horários — ignorado', { name: med.name, rawTimes: med.times });
      continue;
    }

    valuesToInsert.push({
      patientId:        patient.id,
      name:             (med.name   || 'Desconhecido').trim(),
      dosage:           (med.dosage || 'Não especificada').trim(),
      times:            validTimes,
      instructions:     med.instructions || null,
      rawInput:         conversationText,
      aiExtractionJson: med as any,
      isActive:         true,
    });
  }

  if (valuesToInsert.length === 0) {
    logger.warn('Nenhum medicamento válido após filtragem', { patientId: patient.id, context });
    return;
  }

  try {
    await db.insert(medications).values(valuesToInsert);
    logger.info('Persistência de medicamentos concluída (batch atômico)', {
      patientId: patient.id, context, saved: valuesToInsert.length, total: extracted.length,
    });
    // Invalida e re-sincroniza o cache Redis → Neon consulta + atualiza Redis
    await invalidateAndSync();
  } catch (err: any) {
    logger.error('Falha no batch insert de medicamentos — nenhum salvo', {
      error: err.message, patientId: patient.id, context, attempted: valuesToInsert.length,
    });
  }
}
