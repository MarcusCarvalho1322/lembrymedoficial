# Migrations — Lembrymed

Política e procedimentos para gerenciar mudanças no schema do banco de dados.

---

## Stack

- **ORM:** Drizzle ORM v0.45.2
- **Banco:** Neon PostgreSQL Serverless (gerenciado)
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

### 1. Criar branch de preview no Neon

```bash
# Via painel Neon: Branches → Create Branch → nome: preview/nova-feature
# Isso cria uma cópia isolada do banco para testar
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

### 4. Testar no branch preview

```bash
# Conectar ao branch preview
DATABASE_URL_UNPOOLED="postgres://...preview-url..." \
  npm --workspace packages/database run db:push
```

### 5. Validar

- Rodar API contra o branch preview
- Testar queries que usam as novas colunas/tabelas
- Verificar que migrations pendentes não quebram

### 6. Aplicar em produção

```bash
# Sempre em horário de baixo tráfego (madrugada)
DATABASE_URL_UNPOOLED="postgres://...prod-url..." \
  npm --workspace packages/database run db:push
```

### 7. Limpar

- Deletar branch preview no Neon
- Commit + push da migration

---

## Migrations atuais

| # | Arquivo | Status |
|---|---------|--------|
| 0001 | `onboarding_nudge_count.sql` | ✅ Produção |
| 0002 | `cascade_and_lgpd_tables.sql` | ⚠️ Pendente (PR #4) |
| 0003 | `drop_legacy_prisma_fks.sql` | 🧪 Dev |
| 0004 | `reminder_type_enum_migration.sql` | 🧪 Dev |
| 0005 | `medications_deactivated_reason.sql` | 🧪 Dev |
| 0006 | `patients_interaction_mode.sql` | 🧪 Dev |

---

## Rollback de migration

Migrations são aditivas — para desfazer, crie uma nova migration reversa:

```sql
-- Exemplo: migration 0007_reverte_0006.sql
ALTER TABLE patients DROP COLUMN IF EXISTS interaction_mode;
```

NUNCA delete arquivos de migration já aplicados em produção.

---

## Comandos úteis

```bash
# Gerar migration do schema atual
npm --workspace packages/database run db:generate

# Aplicar migration (push schema atual)
npm run db:push

# Ver schema atual no banco (Studio)
npm --workspace packages/database run db:studio

# Conectar ao banco via psql
psql "$DATABASE_URL_UNPOOLED"
```
