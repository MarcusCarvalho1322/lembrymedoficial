import IORedis from 'ioredis';
import { env } from './env';

/** Conexão Redis compartilhada para BullMQ */
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
