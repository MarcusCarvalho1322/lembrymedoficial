/**
 * @module Webhook WhatsApp — Schema Z-API
 *
 * Schema defensivo Zod do payload Z-API. Aceita campos extras (passthrough),
 * mas valida o formato dos campos que usamos.
 */

import { z } from 'zod';

const ZapiMediaSchema = z
  .object({
    imageUrl: z.string().url().optional(),
    audioUrl: z.string().url().optional(),
    documentUrl: z.string().url().optional(),
    url: z.string().url().optional(),
  })
  .partial()
  .passthrough();

export const ZapiPayloadSchema = z
  .object({
    fromMe: z.boolean().optional(),
    type: z.string().optional(),
    phone: z.string().regex(/^\d{10,15}$/, 'telefone fora do formato esperado').optional(),
    text: z
      .object({ message: z.string().optional(), body: z.string().optional() })
      .partial()
      .passthrough()
      .optional(),
    image: ZapiMediaSchema.optional(),
    audio: ZapiMediaSchema.optional(),
    document: ZapiMediaSchema.optional(),
    zaapId: z.string().optional(),
    msgId: z.string().optional(),
    messageId: z.string().optional(),
  })
  .passthrough();

export type ZapiPayload = z.infer<typeof ZapiPayloadSchema>;
