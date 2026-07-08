import { Router } from 'express';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', async (_req, res) => {
  let redisStatus = 'unknown';
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'reconnecting';
  }
  res.json({ status: 'ok', redis: redisStatus, version: 'v2.10-audit', timestamp: new Date().toISOString() });
});

export default router;
