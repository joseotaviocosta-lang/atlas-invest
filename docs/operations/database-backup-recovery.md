# Runbook Operacional: Backup e Recuperação de Base de Dados (Fase 6A)

Este documento define a política, os procedimentos automatizados, os objetivos de recuperação e as invariantes inegociáveis para backup e disaster recovery do **Project Atlas**.

---

## 1. Objetivos de Recuperação (RPO e RTO)

| Métrica                            | Objetivo Operacional                                           | Status Atual Verificado (Fase 6A)                               |
| ---------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| **RPO (Recovery Point Objective)** | $\le 24\text{ horas}$ (backups lógicos diários)                | **Atendido**: snapshot completo via `pnpm db:backup`            |
| **RPO Avançado (Target Nuvem)**    | $\le 1\text{ hora}$ via arquivamento contínuo de WALs          | _Gap de Produção Documentado_ (ver Seção 5)                     |
| **RTO (Recovery Time Objective)**  | $\le 30\text{ minutos}$ (tempo total para restaurar e validar) | **Superado**: Drill automatizado executado em **4.35 segundos** |

---

## 2. Invariantes de Dados e Ledger Financeiro

Durante qualquer procedimento de backup ou restauração, o sistema deve garantir:

1. **Transaction Ledger Append-Only:**
   - A tabela `transactions` é a Fonte da Verdade (Source of Truth) de todo o histórico patrimonial.
   - Todo backup deve preservar rigorosamente a integridade das chaves compostas e das relações entre `users`, `portfolios`, `institutions`, `accounts`, `assets` e `transactions`.
2. **Precisão Arbitrária e Zero Floats:**
   - Todas as colunas financeiras e quantitativas (`amount`, `quantity`, `balance`) utilizam precisão `numeric(38,18)`.
   - Nenhum valor numérico pode sofrer truncamento, conversão para IEEE-754 float ou corrupção de casas decimais no dump/restore.
3. **44 Migrations do Prisma:**
   - O banco restaurado deve conter exatamente as 44 migrations aplicadas na tabela `_prisma_migrations`, sem pendências ou flags de rollback.
4. **Links de Retificação e Decisões de Conciliação:**
   - As tabelas `transaction_rectifications` e `reconciliation_decisions` devem manter integridade referencial com os IDs de transação e runs de integração correspondentes.

---

## 3. Comandos Automatizados de Backup e Verificação

### 3.1 Executar Backup com Checksum SHA-256

```bash
pnpm db:backup
```

**Comportamento:**

- Gera dump lógico SQL consistente utilizando `pg_dump --no-owner --no-privileges`.
- Grava o arquivo em `backups/atlas_backup_<database>_<timestamp>.sql`.
- Calcula o hash criptográfico SHA-256 do arquivo gerado e grava em `backups/atlas_backup_<database>_<timestamp>.sql.sha256`.
- Retorna o caminho absoluto, tamanho e duração em milissegundos.

### 3.2 Executar Drill de Restauração em Base Isolada

```bash
pnpm db:restore:verify
```

**Comportamento do Drill:**

1. Valida a integridade do checksum SHA-256 antes de qualquer intervenção.
2. Cria dinamicamente um banco temporário isolado (`atlas_restore_drill_<timestamp>`).
3. Restaura o arquivo de backup para dentro desse banco temporário.
4. Conecta via Prisma e executa uma bateria exaustiva de validação de integridade:
   - Contagem de migrations aplicadas ($= 44$).
   - Contagem de tabelas públicas ($\ge 61$).
   - Integridade das transações do ledger (sem campos nulos ou corrupção decimal).
   - Vínculos de retificações e conciliações.
   - Itens de watchlist, contas e usuários.
5. Mede o tempo decorrido (RTO).
6. Destrói (`DROP DATABASE`) o banco temporário de forma limpa.
7. Emite relatório com status de cada invariante.

---

## 4. Procedimento Manual de Restauração em Contingência

Caso seja necessária intervenção manual em ambiente de produção ou staging:

### Passo 1: Validação do Checksum

```bash
sha256sum -c backups/atlas_backup_<TARGET>.sql.sha256
```

_Se o hash diferir, ABORTAR imediatamente. O arquivo foi corrompido._

### Passo 2: Criação do Banco Alvo

```bash
docker exec atlas_postgres psql -U atlas -d postgres -c "CREATE DATABASE atlas_restored;"
```

### Passo 3: Restauração do Dump

```bash
cat backups/atlas_backup_<TARGET>.sql | docker exec -i atlas_postgres psql -U atlas -d atlas_restored
```

### Passo 4: Verificação das Invariantes

```bash
docker exec atlas_postgres psql -U atlas -d atlas_restored -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"
# Esperado: 44

docker exec atlas_postgres psql -U atlas -d atlas_restored -c "SELECT count(*) FROM transactions WHERE amount IS NULL OR quantity IS NULL;"
# Esperado: 0
```

---

## 5. Gaps de Produção Documentados

Para a operação plena em larga escala além do beta atual:

1. **Gap 1: Criptografia em Repouso dos Blobs de Backup (Offsite)**
   - Atualmente, os backups são gravados localmente no sistema de arquivos sob permissões restritas.
   - _Ação Futura:_ Implementar envelope de criptografia simétrica (ex: GPG ou AWS KMS / GCP Cloud KMS) antes da transferência para buckets de cold storage (S3 Glacier / Google Cloud Storage Archive).
2. **Gap 2: Point-In-Time Recovery (PITR)**
   - O backup lógico atual provê snapshots periódicos (RPO $\le 24\text{h}$).
   - _Ação Futura:_ Configurar arquivamento contínuo de Write-Ahead Logs (WAL) via `pgBackRest` ou `WAL-G` para viabilizar recuperação para qualquer segundo específico (RPO $\le 1\text{h}$).
3. **Gap 3: Política de Autorização Humana para Sobrescrita**
   - É estritamente proibido qualquer script automatizado executar `DROP DATABASE` ou sobrescrita do banco de produção principal sem autorização dual de operadores (Quorum de 2 engenheiros).
