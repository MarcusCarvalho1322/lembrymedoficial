/**
 * @module Worker — Z-API Health Check
 * @description Verifica a cada 5 minutos se a instância Z-API está conectada.
 * Se estiver desconectada, avisa o admin via WhatsApp (se configurado) e
 * loga aviso para captura em Sentry/monitoração.
 *
 * Sem este worker, a Z-API pode desconectar silenciosamente (por inatividade,
 * troca de número, bloqueio do Meta) e os lembretes param de chegar aos
 * pacientes sem que ninguém perceba.
 *
 * Endpoint: GET https://api.z-api.io/instances/{id}/token/{token}/status
 * Retorna: { connected: true/false, session: "running"/"notConnected"/...}
 */

import cron from 'node-cron';
import { WhatsAppClient } from '../clients/dialog360.client';
import { env } from '../config/env';
import { logger } from '@lembrymed/shared/logger';

const CHECK_INTERVAL_CRON = '*/5 * * * *'; // a cada 5 min

// Estado em memória para evitar repetir o mesmo alerta
let lastAlertedState: 'connected' | 'disconnected' | null = null;

async function checkZapiStatus(): Promise<{ connected: boolean; raw: any } | null> {
  const instanceId = env.ZAPI_INSTANCE_ID;
  const token = env.ZAPI_TOKEN;
  const clientToken = env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !token) {
    // Não é Z-API ou env incompleta — skip sem erro
    return null;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/status`;
  try {
    const res = await fetch(url, {
      headers: clientToken ? { 'Client-Token': clientToken } : {},
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      logger.warn('Z-API health: resposta não-OK', { status: res.status });
      return { connected: false, raw: { http: res.status } };
    }

    const data = (await res.json()) as any;
    // Z-API retorna shape como: { connected: boolean, session, smartphoneConnected }
    const connected = data.connected === true;
    return { connected, raw: data };
  } catch (err: any) {
    logger.warn('Z-API health: falha na requisição', { error: err.message });
    return { connected: false, raw: { error: err.message } };
  }
}

async function alertAdmin(message: string): Promise<void> {
  const adminNumber = env.ADMIN_WHATSAPP;
  if (!adminNumber) {
    logger.warn('ADMIN_WHATSAPP não configurado — alerta Z-API apenas logado', { message });
    return;
  }
  try {
    const whatsapp = new WhatsAppClient();
    await whatsapp.sendTextMessage(adminNumber, message);
  } catch (err: any) {
    logger.warn('Falha ao alertar admin sobre Z-API (provavelmente Z-API está fora mesmo)', {
      error: err.message,
    });
  }
}

export function startZapiHealthWorker() {
  // Sem env Z-API configurada → não iniciar worker
  if (!env.ZAPI_INSTANCE_ID || !env.ZAPI_TOKEN) {
    logger.info('Z-API health worker não iniciado (env incompleta)');
    return;
  }

  cron.schedule(CHECK_INTERVAL_CRON, async () => {
    const result = await checkZapiStatus();
    if (!result) return;

    const state = result.connected ? 'connected' : 'disconnected';

    // Primeiro check ou mudança de estado → logar + alertar
    if (lastAlertedState !== state) {
      if (state === 'disconnected') {
        logger.error('Z-API DESCONECTADA — lembretes podem estar parados', { raw: result.raw });
        await alertAdmin(
          `🚨 *Lembrymed — Z-API desconectada*\n\n` +
          `A instância WhatsApp do Lembrymed está *offline*.\n` +
          `Lembretes aos pacientes podem estar parados neste momento.\n\n` +
          `Verifique: z-api.io → painel da instância → escaneie QR Code se necessário.`,
        );
      } else {
        logger.info('Z-API reconectada');
        if (lastAlertedState === 'disconnected') {
          await alertAdmin(
            `✅ *Lembrymed — Z-API reconectada*\n\nOs lembretes voltaram a funcionar.`,
          );
        }
      }
      lastAlertedState = state;
    }
  });

  logger.info('Z-API health worker started (checks every 5 min)');
}
