# Procedimentos Operacionais: Backup e Restauração de Dados

Este documento estabelece os procedimentos canônicos de backup, verificação de integridade e restauração para a base de dados do **Project Atlas** no ambiente **Remote Owner MVP**.

---

## 1. Princípios e Invariantes

1. **Transaction Ledger Append-Only:**
   - A tabela `transactions` é a Fonte da Verdade (Source of Truth) de todo o histórico contábil e patrimonial.
   - Todo backup deve preservar rigorosamente a integridade referencial entre `users`, `portfolios`, `institutions`, `accounts` e `transactions`.
2. **Nenhuma Alteração em Produção Sem Snapshot Prévio:**
   - Toda aplicação de migration (`pnpm db:migrate` / `prisma migrate deploy`) ou atualização de versão deve ser precedida de um backup integral do banco.
3. **Criptografia e Isolamento de Backups:**
   - Arquivos de backup contêm dados patrimoniais e fiscais sensíveis do titular.
   - Devem ser armazenados em volume criptografado em repouso e protegidos contra acesso público.

---

## 2. Procedimento de Backup (pg_dump)

### 2.1 Backup Integral Comprimido (Recomendado)

O formato personalizado do PostgreSQL (`-F c`) produz um arquivo binário comprimido que permite restauração paralela e seleção de tabelas.

```bash
# Definir timestamp da operação
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/atlas"
mkdir -p "$BACKUP_DIR"

# Executar backup com integridade transacional consistente
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_DIR/atlas_backup_${TIMESTAMP}.dump"
```

### 2.2 Backup em Docker (Ambiente Local / Contêiner)

```bash
# Backup do contêiner PostgreSQL
docker exec -t atlas_postgres_container pg_dump \
  -U atlas \
  -d atlas_dev \
  -F c \
  -b \
  -v > "atlas_backup_$(date +%Y%m%d_%H%M%S).dump"
```

---

## 3. Procedimento de Restauração (pg_restore)

### 3.1 Restauração em Nova Base ou Base Vazia

```bash
# 1. Criar banco de dados de destino se não existir
createdb -h localhost -U atlas atlas_restored

# 2. Executar restauração via pg_restore
pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --verbose \
  "/var/backups/atlas/atlas_backup_TARGET.dump"
```

### 3.2 Restauração Controlada em Docker

```bash
# 1. Copiar dump para o contêiner
docker cp atlas_backup_TARGET.dump atlas_postgres_container:/tmp/restore.dump

# 2. Executar restauração
docker exec -i atlas_postgres_container pg_restore \
  -U atlas \
  -d atlas_dev \
  --clean \
  --if-exists \
  --no-owner \
  /tmp/restore.dump

# 3. Remover arquivo temporário
docker exec -i atlas_postgres_container rm /tmp/restore.dump
```

---

## 4. Verificação Pós-Restauração (Integrity Verification)

Após qualquer restauração, deve-se validar a contagem e a integridade matemática dos registros:

```sql
SELECT 'users' AS entidade, count(*) AS total FROM users
UNION ALL
SELECT 'portfolios', count(*) FROM portfolios
UNION ALL
SELECT 'accounts', count(*) FROM accounts
UNION ALL
SELECT 'transactions', count(*) FROM transactions;
```

Em seguida, execute uma verificação de replay via endpoint da API para garantir que não há posições negativas ou cálculos corrompidos:

```bash
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  https://api.yourdomain.com/api/v1/portfolios/$PORTFOLIO_ID/state | jq .
```

---

## 5. Política de Retenção e Frequência

- **Frequência Mínima:** Snapshot diário automatizado via cron às 03:00 UTC.
- **Backups Pré-Deploy:** Obrigatório antes de qualquer execução de `prisma migrate deploy`.
- **Janela de Retenção Recomendada:**
  - Diários: 14 dias
  - Semanais: 8 semanas
  - Mensais: 12 meses (para conformidade fiscal anual)
