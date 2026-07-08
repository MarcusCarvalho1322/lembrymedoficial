/**
 * @module Conexão com Neon PostgreSQL
 * @description Inicializa o cliente Drizzle ORM com Neon serverless.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

export * from './schema';
export { eq, and, or, desc, asc, sql as sqlOp, gte, lte, ne, isNull, isNotNull, inArray, notInArray, count } from 'drizzle-orm';
