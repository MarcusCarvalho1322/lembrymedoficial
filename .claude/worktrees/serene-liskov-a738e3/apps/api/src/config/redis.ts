import IORedis from 'ioredis';

/** Conexão Redis compartilhada para BullMQ */
export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
