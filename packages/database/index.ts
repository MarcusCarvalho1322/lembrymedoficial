/**
 * @module Conexão PostgreSQL
 * @description Inicializa o cliente Drizzle ORM com node-postgres (pg).
 * Migrado de Neon serverless para PostgreSQL self-hosted em container Docker
 * (julho/2026 — centralização de infraestrutura).
 *
 * Vantagens vs Neon serverless:
 *   - Conexões TCP persistentes (sem cold-start de 100-400ms)
 *   - Suporte a transações multi-statement (BEGIN/COMMIT)
 *   - Zero lock-in de plataforma
 */

import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const db = drizzle(pool, { schema });

export * from './schema';
export { eq, and, or, desc, asc, sql as sqlOp, gte, lte, ne, isNull, isNotNull, inArray, notInArray, count } from 'drizzle-orm';
