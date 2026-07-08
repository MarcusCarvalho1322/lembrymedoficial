/**
 * @module Webhook WhatsApp — Download de mídia (imagem/PDF)
 *
 * Baixa mídia de URL externa fornecida pela Z-API e converte para base64
 * para uso na Vision/Document API do Claude.
 *
 * SSRF guard: bloqueia hosts privados (10/8, 127, 169.254, 172.16/12,
 * 192.168/16, loopback IPv6, link-local), exige protocolo http(s), bloqueia
 * redirects e exige allowlist de hosts.
 */

import { logger } from '@lembrymed/shared/logger';

export type MediaResult =
  | { kind: 'image'; base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }
  | { kind: 'pdf';   base64: string };

/**
 * Hosts cujas mídias podemos baixar. Sufixos completos (não regex).
 */
export const MEDIA_HOST_ALLOWLIST = [
  'z-api.io',
  'storage.googleapis.com', // Z-API armazena media em GCS
  'storage.cloud.google.com',
];

export function isAllowedMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return MEDIA_HOST_ALLOWLIST.some((s) => h === s || h.endsWith('.' + s));
}

export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1, 5).map(Number);
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    return false;
  }
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd')) return true;
  return false;
}

export async function fetchMediaAsBase64(url: string): Promise<MediaResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    logger.warn('fetchMediaAsBase64: URL inválida', { urlSnippet: url.substring(0, 60) });
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    logger.warn('fetchMediaAsBase64: protocolo não permitido', { proto: parsed.protocol });
    return null;
  }
  if (isPrivateHost(parsed.hostname)) {
    logger.warn('fetchMediaAsBase64: host privado bloqueado (SSRF)', { host: parsed.hostname });
    return null;
  }
  if (!isAllowedMediaHost(parsed.hostname)) {
    logger.warn('fetchMediaAsBase64: host fora da allowlist bloqueado', { host: parsed.hostname });
    return null;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
    if (!res.ok) {
      logger.warn('fetchMediaAsBase64: HTTP error', { status: res.status, url: url.substring(0, 80) });
      return null;
    }

    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const buf = await res.arrayBuffer();

    if (ct === 'application/pdf' || url.toLowerCase().includes('.pdf')) {
      if (buf.byteLength > 10 * 1024 * 1024) {
        logger.warn('fetchMediaAsBase64: PDF > 10 MB ignorado', { bytes: buf.byteLength });
        return null;
      }
      return { kind: 'pdf', base64: Buffer.from(buf).toString('base64') };
    }

    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = imageTypes.includes(ct) ? ct : 'image/jpeg';
    if (buf.byteLength > 4 * 1024 * 1024) {
      logger.warn('fetchMediaAsBase64: imagem > 4 MB ignorada', { bytes: buf.byteLength });
      return null;
    }
    return { kind: 'image', base64: Buffer.from(buf).toString('base64'), mediaType: mediaType as any };
  } catch (err: any) {
    logger.warn('fetchMediaAsBase64: falha ao baixar mídia', { error: err.message });
    return null;
  }
}

/** Constrói o content block correto para imagem ou PDF (formato Anthropic SDK). */
export function buildMediaContentBlock(media: MediaResult): object {
  if (media.kind === 'pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: media.base64 } };
  }
  return { type: 'image', source: { type: 'base64', media_type: media.mediaType, data: media.base64 } };
}
