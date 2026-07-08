/**
 * @module Worker — Motivational Message
 * @description Envia mensagens de estímulo e conscientização para pacientes ativos.
 *
 * ROTAÇÃO DE HORÁRIOS E DIAS:
 *   A cada semana o worker usa um padrão diferente de dias e horários,
 *   para que as mensagens não cheguem sempre na mesma hora/dia e pareçam
 *   mais naturais — como uma atenção genuína, não uma automação previsível.
 *
 *   6 padrões semanais (rotaciona pelo número ISO da semana):
 *     Semana A: Seg 08h · Qua 09h · Sex 10h
 *     Semana B: Ter 09h · Qui 10h · Sáb 11h
 *     Semana C: Seg 10h · Qui 08h · Sáb 09h
 *     Semana D: Ter 08h · Qua 10h · Sex 11h
 *     Semana E: Seg 09h · Ter 11h · Sex 08h
 *     Semana F: Qua 08h · Qui 09h · Sáb 10h
 *
 * TOM: Positivo, acolhedor, estimulante. Nunca medo, cobrança ou culpa.
 * CATEGORIAS: família · conquista · futuro · autonomia · autoestima · você sabia?
 * ROTATIVIDADE: 30 mensagens — sem repetição por ~10 semanas por paciente.
 */

import { db } from '@lembrymed/database';
import { sql } from 'drizzle-orm';
import { redis } from '../config/redis';
import { WhatsAppClient } from '../clients/dialog360.client';
import { logger } from '@lembrymed/shared/logger';
import { getNowBRT, getTodayBRT } from '../lib/brt';

// ══════════════════════════════════════════════════════════════
// PADRÕES DE ENVIO — rotaciona pela semana ISO do ano
// Cada entrada: [diasDaSemana[], horasPorDia[]]
// 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb
// ══════════════════════════════════════════════════════════════

const WEEK_PATTERNS: { day: number; hour: number }[][] = [
  // Semana A
  [{ day: 1, hour: 8 }, { day: 3, hour: 9 }, { day: 5, hour: 10 }],
  // Semana B
  [{ day: 2, hour: 9 }, { day: 4, hour: 10 }, { day: 6, hour: 11 }],
  // Semana C
  [{ day: 1, hour: 10 }, { day: 4, hour: 8 }, { day: 6, hour: 9 }],
  // Semana D
  [{ day: 2, hour: 8 }, { day: 3, hour: 10 }, { day: 5, hour: 11 }],
  // Semana E
  [{ day: 1, hour: 9 }, { day: 2, hour: 11 }, { day: 5, hour: 8 }],
  // Semana F
  [{ day: 3, hour: 8 }, { day: 4, hour: 9 }, { day: 6, hour: 10 }],
];

/** Retorna o número ISO da semana (1–53) para uma data */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Verifica se agora (BRT) é um dos slots de envio desta semana */
function isDispatchSlotNow(nowBRT: Date): boolean {
  const week    = getISOWeek(nowBRT);
  const pattern = WEEK_PATTERNS[week % WEEK_PATTERNS.length];
  const weekday = nowBRT.getDay();
  const hour    = nowBRT.getHours();
  const minute  = nowBRT.getMinutes();

  return pattern.some(
    (slot) => slot.day === weekday && slot.hour === hour && minute < 2,
  );
}

// ══════════════════════════════════════════════════════════════
// BIBLIOTECA DE MENSAGENS — 30 mensagens, 6 categorias × 5
// ══════════════════════════════════════════════════════════════

type MessageFn = (name: string) => string;

const MESSAGE_LIBRARY: MessageFn[] = [
  // ── 💚 FAMÍLIA ─────────────────────────────────────────────

  (name) =>
    `💚 Bom dia, ${name}!\n\nTomar sua medicação direitinho é garantir mais saúde para aproveitar cada momento com seus filhos, netos e as pessoas que você ama. Cada dose é um presente para o seu futuro! 🌟`,

  (name) =>
    `💚 ${name}, sabia que cuidar da saúde hoje é garantir que você estará presente nos momentos mais importantes da sua família?\n\nCasamentos, aniversários, nascimentos... sua saúde é o que permite você estar lá. Continue firme! 🥰`,

  (name) =>
    `💚 Bom dia, ${name}!\n\nQuem te ama quer te ver bem. Cada medicamento tomado no horário certo é uma forma de dizer "eu me cuido porque vocês importam pra mim". Que dia lindo para cuidar de você! 🌸`,

  (name) =>
    `💚 ${name}, a melhor herança que você pode deixar para quem ama é o seu exemplo de autocuidado.\n\nCuidar da saúde com disciplina é sabedoria — e seus netos vão se lembrar de você como alguém que valorizou a vida! 🌻`,

  (name) =>
    `💚 Bom dia, ${name}!\n\nImagine daqui a alguns anos, com saúde e energia para brincar com seus netos, viajar, rir muito. Isso começa com os pequenos cuidados de hoje. Você está no caminho certo! ✨`,

  // ── 🌟 CONQUISTA ───────────────────────────────────────────

  (name) =>
    `🌟 ${name}, cada dia que você toma sua medicação no horário é uma pequena vitória!\n\nEssas vitórias diárias se somam e resultam em mais qualidade de vida, mais disposição e mais saúde. Você está construindo algo incrível! 💪`,

  (name) =>
    `🌟 Bom dia, ${name}!\n\nCuidar da saúde exige disciplina — e isso é uma qualidade admirável. Você que escolhe se cuidar todos os dias merece reconhecimento. Parabéns pelo compromisso com a sua vida! 👏`,

  (name) =>
    `🌟 ${name}, sabe o que é impressionante? A consistência!\n\nNão é um dia perfeito que faz a diferença — é o hábito de cuidar da saúde dia após dia. Você está construindo esse hábito, e isso é poderoso! 🔥`,

  (name) =>
    `🌟 Bom dia, ${name}!\n\nPessoas que cuidam da saúde regularmente têm mais energia, mais disposição e vivem com muito mais qualidade. Você faz parte desse grupo especial. Continue assim! 💎`,

  (name) =>
    `🌟 ${name}, seu futuro eu vai te agradecer!\n\nCada medicamento tomado hoje é um investimento que você está fazendo em si mesmo. Os resultados aparecem com o tempo — e valem cada esforço. Você está indo muito bem! 🎯`,

  // ── 🌱 FUTURO ──────────────────────────────────────────────

  (name) =>
    `🌱 Bom dia, ${name}!\n\nA saúde que você cuida hoje é o alicerce do amanhã que você quer viver. Sonhos, planos, viagens, conquistas — tudo começa com bem-estar. Você está plantando sementes lindas! 🌻`,

  (name) =>
    `🌱 ${name}, pense em uma coisa que você ainda quer fazer na vida.\n\nViajar, ver alguém se casar, conhecer um neto, realizar um sonho... Sua saúde é o que vai permitir você chegar até lá. Cuide-se com carinho! ✈️`,

  (name) =>
    `🌱 Bom dia, ${name}!\n\nAs melhores histórias ainda estão por vir. E para vivê-las com saúde e alegria, os cuidados de hoje fazem toda a diferença. Cada dia bem cuidado é um capítulo novo e bonito! 📖`,

  (name) =>
    `🌱 ${name}, saúde não é ausência de doença — é a capacidade de viver plenamente!\n\nCom tratamento em dia, você amplia sua capacidade de aproveitar tudo que a vida tem de melhor. Siga em frente! 🌈`,

  (name) =>
    `🌱 Bom dia, ${name}!\n\nCada manhã é uma nova oportunidade de cuidar de você. Quem investe na saúde hoje colhe bem-estar por muitos anos. Que bom começar o dia com esse pensamento! ☀️`,

  // ── 💪 AUTONOMIA ───────────────────────────────────────────

  (name) =>
    `💪 Bom dia, ${name}!\n\nSaúde em dia significa mais independência — fazer o que quer, ir aonde quiser, não depender de ninguém. Cuidar do tratamento é cuidar da sua liberdade! 🦋`,

  (name) =>
    `💪 ${name}, pessoas que mantêm o tratamento em dia têm mais energia para o dia a dia!\n\nMais disposição para cozinhar, sair, se divertir, se movimentar. Sua medicação é sua aliada, não um fardo. 💚`,

  (name) =>
    `💪 Bom dia, ${name}!\n\nQuando a saúde está bem cuidada, a vida flui melhor. Você dorme melhor, acorda com mais disposição, tem mais energia para as coisas que ama. Continue investindo nisso! 🌙`,

  (name) =>
    `💪 ${name}, seu corpo trabalha muito por você todos os dias.\n\nA medicação correta é a parceria que ele precisa para continuar forte. Cuidar de si mesmo é um ato de amor e respeito próprio! ❤️`,

  (name) =>
    `💪 Bom dia, ${name}!\n\nIndependência é um dos maiores tesouros da vida. E ela começa com saúde. Quem cuida do tratamento mantém o controle sobre a própria vida. Que poder é esse! 🏆`,

  // ── 🤗 AUTOESTIMA ──────────────────────────────────────────

  (name) =>
    `🤗 Bom dia, ${name}!\n\nVocê merece se sentir bem. Isso não é luxo — é necessidade! Cuidar da saúde é uma das formas mais bonitas de dizer "eu me valorizo e mereço uma vida plena". Que essa semana seja incrível! 🌸`,

  (name) =>
    `🤗 ${name}, se cuidar é um ato de amor próprio!\n\nPessoas que priorizam a saúde vivem com mais alegria, mais leveza e mais presença. Você está fazendo a escolha certa ao cuidar de si mesmo. Continue! 💕`,

  (name) =>
    `🤗 Bom dia, ${name}!\n\nVocê é importante. Para sua família, para seus amigos, para todos que te conhecem. E para continuar sendo essa presença especial na vida deles, cuidar da saúde é essencial. Você vale muito! ⭐`,

  (name) =>
    `🤗 ${name}, autocuidado não é egoísmo — é sabedoria!\n\nQuando você está bem, tudo ao redor flui melhor. Suas relações melhoram, seu humor melhora, sua vida melhora. Cuidar de você é cuidar de tudo! 🌺`,

  (name) =>
    `🤗 Bom dia, ${name}!\n\nVocê passou por muita coisa na vida e continua de pé. Isso mostra sua força! Seguir o tratamento é mais uma prova de que você é uma pessoa determinada e que se valoriza. Parabéns! 🦁`,

  // ── 💡 VOCÊ SABIA? ─────────────────────────────────────────

  (name) =>
    `💡 ${name}, você sabia?\n\nMetade dos pacientes que usam medicação diária não toma corretamente — simplesmente por esquecer! Isso pode piorar a doença e até levar a internamentos desnecessários.\n\nPor isso o Lembrymed existe: para ser o lembrete carinhoso que faz toda a diferença. Você está em ótimas mãos! 💚`,

  (name) =>
    `💡 ${name}, você sabia que tomar a medicação no horário certo pode aumentar muito a eficácia do tratamento?\n\nMuitos remédios funcionam melhor quando mantêm nível constante no sangue. Consistência é o segredo — e você já pratica isso! 👏`,

  (name) =>
    `💡 Curiosidade, ${name}!\n\nPacientes que mantêm o tratamento em dia têm até 40% menos internações hospitalares.\n\nIsso significa mais tempo em casa, com a família, fazendo o que ama. Seu cuidado diário vale ouro! 🏅`,

  (name) =>
    `💡 ${name}, você sabia que o maior inimigo do tratamento não é a medicação em si, mas o esquecimento?\n\nMais de 50% das pessoas interrompem o tratamento sem querer — só por falta de lembretes. O Lembrymed resolve exatamente isso. Você já deu o passo mais importante! ✅`,

  (name) =>
    `💡 Curiosidade, ${name}!\n\nCom tratamento bem controlado, muitas pessoas conseguem reduzir doses ao longo do tempo — porque o corpo responde melhor.\n\nIsso só acontece com consistência no dia a dia. Você está construindo esse resultado agora, com cada medicamento tomado no horário! 🌟`,

  (name) =>
    `💡 ${name}, você sabia?\n\nPessoas que usam lembretes para medicação têm 3× mais chances de manter o tratamento em dia do que quem tenta se lembrar sozinho.\n\nVocê já fez a escolha certa ao usar o Lembrymed. Continue assim — sua saúde agradece! 💊💚`,
];

// getNowBRT e getTodayBRT vivem em ../lib/brt (centralizado na Onda 2).

/**
 * Retorna a próxima mensagem para o paciente (rotação cíclica).
 * O índice Redis avança a cada envio, garantindo que todas as 31 mensagens
 * sejam usadas antes de repetir.
 */
async function getNextMessageFn(patientId: string): Promise<MessageFn> {
  const indexKey = `lembrymed:motivational:index:${patientId}`;
  const raw      = await redis.get(indexKey);
  const current  = raw ? parseInt(raw, 10) : 0;
  const next     = (current + 1) % MESSAGE_LIBRARY.length;
  await redis.set(indexKey, String(next));
  return MESSAGE_LIBRARY[current];
}

// ══════════════════════════════════════════════════════════════
// TICK PRINCIPAL
// ══════════════════════════════════════════════════════════════

async function runMotivationalTick(): Promise<void> {
  const nowBRT = getNowBRT();

  if (!isDispatchSlotNow(nowBRT)) return;

  const todayBRT = getTodayBRT();

  const result = await db.execute(sql`
    SELECT p.id, p.full_name, p.phone
    FROM patients p
    JOIN subscriptions s ON s.patient_id = p.id AND s.status = 'active'
    WHERE p.is_active = true
      AND p.onboarding_step = 'active'
  `);

  if (result.rows.length === 0) return;

  const whatsapp = new WhatsAppClient();
  let sent = 0;

  for (const row of result.rows as any[]) {
    // Dedup: apenas 1 mensagem motivacional por paciente por dia
    const dedupKey   = `lembrymed:motivational:sent:${row.id}:${todayBRT}`;
    const alreadySent = await redis.get(dedupKey);
    if (alreadySent) continue;

    const firstName = (row.full_name as string).split(' ')[0];
    const messageFn = await getNextMessageFn(row.id);
    const message   = messageFn(firstName);

    try {
      await whatsapp.sendTextMessage(row.phone, message);
      await redis.set(dedupKey, '1', 'EX', 90_000); // TTL 25h
      sent++;
      logger.info('Motivational message sent', {
        patient: row.id,
        phone: (row.phone as string).substring(0, 8) + '****',
      });
    } catch (err: any) {
      logger.error('Failed to send motivational message', { patient: row.id, error: err.message });
    }
  }

  if (sent > 0) {
    logger.info('Motivational messages dispatched', { count: sent, todayBRT });
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════════════════

export function startMotivationalWorker(): void {
  runMotivationalTick().catch((err) =>
    logger.error('Motivational tick error', { error: err.message }),
  );
  setInterval(() => {
    runMotivationalTick().catch((err) =>
      logger.error('Motivational tick error', { error: err.message }),
    );
  }, 60_000);

  logger.info('Motivational message worker started (3×/semana, horários e dias rotativos)');
}
