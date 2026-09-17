# Migrations — Lembrymed

Política e procedimentos para gerenciar mudanças no schema do banco de dados.

---

## Stack

- **ORM:** Drizzle ORM v0.45.2
- **Driver:** `pg` (node-postgres) — conexões TCP
- **Banco:** PostgreSQL 16 self-hosted (container Docker na VPS)
- **Migrations:** SQL gerado pelo `drizzle-kit generate`, versionado no git

---

## Política de Migrations

1. **Toda migration é aditiva.** Nunca criar migration que apaga colunas/tabelas sem script de rollback documentado.
2. **NUNCA rodar migration em produção antes de testar em staging.**
3. **Toda migration tem um arquivo `.sql`** em `packages/database/migrations/`.
4. **Migrations são numeradas sequencialmente:** `0001_`, `0002_`, `0003_`...
5. **Cada migration tem um script de rollback** documentado no próprio arquivo `.sql` (como comentário no topo).

---

## Fluxo seguro

### 1. Fazer backup antes

```bash
# Antes de qualquer migration em produção:
./scripts/backup.sh
```

### 2. Gerar migration

```bash
# Editar schema.ts primeiro, depois:
npm --workspace packages/database run db:generate
```

Isso gera um arquivo SQL em `packages/database/migrations/000X_descricao.sql`.

### 3. Revisar o SQL gerado

Abra o arquivo e verifique:
- [ ] Apenas operações aditivas (CREATE, ALTER ADD)
- [ ] Sem DROP TABLE, DROP COLUMN sem IF EXISTS
- [ ] Índices novos não duplicam existentes
- [ ] Constraints FOREIGN KEY com ON DELETE apropriado

### 4. Testar em staging (ou banco local)

```bash
# Com o compose de dev rodando:
DATABASE_URL="postgresql://lembrymed:lembrymed_dev@localhost:5432/lembrymed" \
  npm --workspace packages/database run db:push
```

### 5. Aplicar em produção

```bash
# Dentro do container API:
docker compose -f docker-compose.prod.yml exec api \
  npx tsx packages/database/apply-migration.ts packages/database/migrations/000X_nome.sql

# Ou aplicar TODAS pendentes via drizzle-kit push:
docker compose -f docker-compose.prod.yml exec api \
  sh -c 'DATABASE_URL_UNPOOLED=$DATABASE_URL npx drizzle-kit push --config packages/database/drizzle.config.ts'
```

### 6. Verificar

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U lembrymed -d lembrymed -c '\dt'
```

---

## Migrations atuais

| # | Arquivo | Status |
|---|---------|--------|
| 0001 | `onboarding_nudge_count.sql` | ✅ Aplicada |
| 0002 | `cascade_and_lgpd_tables.sql` | ✅ Aplicada |
| 0003 | `drop_legacy_prisma_fks.sql` | ✅ Aplicada |
| 0004 | `reminder_type_enum_migration.sql` | ✅ Aplicada |
| 0005 | `medications_deactivated_reason.sql` | ✅ Aplicada |
| 0006 | `patients_interaction_mode.sql` | ✅ Aplicada |

---

## Rollback de migration

Migrations são aditivas — para desfazer, crie uma nova migration reversa:

```sql
-- Exemplo: migration 0007_reverte_0006.sql
ALTER TABLE patients DROP COLUMN IF EXISTS interaction_mode;
```

NUNCA delete arquivos de migration já aplicados em produção.
Para rollback de emergência, use o backup:

```bash
./scripts/restore.sh /opt/lembrymed/data/backups/lembrymed_ULTIMO.dump.gz
```

---

## Comandos úteis

```bash
# Gerar migration do schema atual
npm --workspace packages/database run db:generate

# Aplicar migration (push schema atual)
npm run db:push

# Ver schema atual no banco (Studio)
npm --workspace packages/database run db:studio

# Conectar ao banco via psql (dentro do container)
docker compose exec postgres psql -U lembrymed -d lembrymed
```
