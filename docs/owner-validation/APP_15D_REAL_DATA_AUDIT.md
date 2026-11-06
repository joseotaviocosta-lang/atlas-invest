# PROJECT ATLAS — APP-15D
# REAL DATA AUDIT REPORT

**Data:** 06 de Novembro de 2026  
**Ambiente:** Windows 11 x64 (Atlas Desktop Local Owner Mode)  
**Database:** `atlas_local` (PostgreSQL 18 na porta 5434)  
**Status:** `APP_15D_REAL_OWNER_PORTFOLIO_ONBOARDING_COMPLETE`

---

## 1. Baseline do Banco Local (`atlas_local`)

Antes do início da importação, o banco de dados continha o bootstrap determinístico:

| Tabela | Contagem Inicial | Contagem Pós-Importação | Delta |
|---|---:|---:|:---:|
| `users` | 1 | 1 | 0 |
| `portfolios` | 1 | 1 | 0 |
| `institutions` | 1 | 1 | 0 |
| `accounts` | 1 | 1 | 0 |
| `assets` | 0 | 7 | +7 |
| `transactions` | 0 | 11 | +11 |
| `integration_runs` | 0 | 4 | +4 |
| `integration_run_transactions` | 0 | 0 | 0 |
| `reconciliation_decisions` | 0 | 0 | 0 |
| `tax_obligations` | 0 | 0 | 0 |
| `cost_basis_evidence` | 0 | 0 | 0 |

### Identificadores Canônicos:
- **User:** `00000000-0000-4000-8000-000000000001` (`owner@atlas.local`)
- **Portfolio:** `00000000-0000-4000-8000-000000000002` ("Carteira Principal", `BRL`)
- **Institution:** `00000000-0000-4000-8000-000000000004` ("B3 / Corretora Principal", `BROKER`, `BR`)
- **Account:** `00000000-0000-4000-8000-000000000005` ("Custódia Principal", `BRL`, `ACTIVE`)

---

## 2. Arquivos Reais Disponíveis Descobertos

Na pasta `C:\Users\joseo\Downloads`, foram auditados os arquivos oficiais exportados da Área do Investidor da B3:

| Arquivo | Tamanho | Data Exportação | Tipo / Finalidade |
|---|---:|:---:|---|
| `negociacao-2026-10-29-11-44-55.xlsx` | 5.308 bytes | 29/10/2026 | **Negociações recentes (30/09 a 08/10/2026) — ESCOLHIDO** |
| `negociacao-2026-10-29-11-47-35.xlsx` | 7.371 bytes | 29/10/2026 | Negociações ano 2025/2026 |
| `negociacao-2026-10-29-18-20-59.xlsx` | 13.260 bytes | 29/10/2026 | Histórico mais amplo de negociações |
| `movimentacao-2026-10-29-11-45-10.xlsx` | 7.166 bytes | 29/10/2026 | Movimentações / Proventos |
| `movimentacao-2026-10-29-11-47-54.xlsx` | 31.507 bytes | 29/10/2026 | Movimentações consolidadas |
| `posicao-2026-10-29-11-46-14.xlsx` | 12.418 bytes | 29/10/2026 | Snapshot de Custódia em 29/10/2026 |
| `relatorio-consolidado-anual-2020.xlsx` ... `2025.xlsx` | ~14 KB cada | 29/10/2026 | Relatórios Anuais Consolidados |

---

## 3. Fonte Real Utilizada na Primeira Importação

- **Arquivo:** `negociacao-2026-10-29-11-44-55.xlsx`
- **Hash SHA-256:** `373ec324dc1153ea504a32ea2190bd0c1298be7aa9af7209ab6c0b8bba093d69`
- **Período Coberto:** `30/09/2026` a `08/10/2026`
- **Registros:** 14 operações no Mercado à Vista (11 Compras, 3 Vendas)
- **Corretora:** XP Investimentos CCTVM S/A

---

## 4. Backups de Segurança

Antes e depois da ingestão, foram gerados backups físicos consistentes via `pg_dump`:
1. **Pré-importação (Baseline):**  
   `%LOCALAPPDATA%\Atlas\backups\atlas_local_baseline_20261106-134939.sql` (165.191 bytes)
2. **Pós-importação (Com transações reais):**  
   `%LOCALAPPDATA%\Atlas\backups\atlas_local_post_import_20261106-140303.sql` (172.212 bytes)

Comando de restauração para emergência:
```powershell
$env:PGPASSWORD = "atlas"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5434 -U atlas -d atlas_local -f <caminho-do-backup>.sql
```

---

## 5. Auditoria de Preview, Confirmação e Deduplicação

### 5.1. Preview Inicial
- `totalRows`: 14
- `ready`: 14
- `duplicates`: 0
- `needsReview`: 0
- `invalid`: 0
- `unsupported`: 0
- `ambiguousAssets`: 0

### 5.2. Confirmação Controlada
- **Receipt ID:** `e940094e-575b-4470-86da-3aa82f44b0e0`
- **Created (Persistidas no Ledger):** 11 (todas as compras)
- **Skipped by User:** 3 (vendas órfãs de `ITSA4`, `JHSF3`, `SAPR4` detidas desde anos anteriores, puladas com segurança)
- **Failed:** 0
- **Confirmed At:** `2026-11-06T16:58:21.067Z`

### 5.3. Teste de Reimportação e Idempotência (PARTE W)
Ao reimportar a mesma planilha `negociacao-2026-10-29-11-44-55.xlsx`:
- **Preview:** Detectou exatamente **11 `EXACT_DUPLICATE`** e 3 `NEW` (as 3 puladas).
- **Confirmação:** Gerou **`created: 0`**, **`skippedDuplicates: 11`**, **`skippedByUser: 3`**.
- **Contagem no Banco:** Manteve exatamente as **11 transações originais** sem duplicações.

---

## 6. Auditoria de Posições e Preço Médio (Custo Contábil)

Todas as 7 posições geradas derivam estritamente do replay do ledger append-only:

| Ativo | Tipo | Operações | Quantidade | Preço Médio Contábil | Custo Total de Aquisição | Classificação de Custo |
|:---:|:---:|:---:|---:|---:|---:|:---:|
| **BRCR11** | FII | 1 Compra (30/09) | 24 | R$ 41,580000 | R$ 997,92 | **PROVEN** |
| **IRIM11** | FII | 3 Compras (30/09, 08/10, 08/10) | 28 | R$ 63,283929 | R$ 1.771,95 | **PROVEN** |
| **SNAG11** | Fiagro | 1 Compra (08/10) | 80 | R$ 9,940000 | R$ 795,20 | **PROVEN** |
| **SNCI11** | FII | 1 Compra (08/10) | 10 | R$ 86,430000 | R$ 864,30 | **PROVEN** |
| **SNEL11** | FII | 2 Compras (08/10, 08/10) | 760 | R$ 7,940000 | R$ 6.034,40 | **PROVEN** |
| **SNFZ11** | Fiagro | 2 Compras (08/10, 08/10) | 209 | R$ 9,165694 | R$ 1.915,63 | **PROVEN** |
| **VGIP11** | FII | 1 Compra (08/10) | 40 | R$ 75,510000 | R$ 3.020,40 | **PROVEN** |
| **TOTAL** | — | **11 transações** | **1.151 cotas** | — | **R$ 15.399,80** | **100% PROVEN** |

**Diferença em Relação ao Arquivo Fonte:** **R$ 0,00 (0,000000 cotas) — Batimento Matemático Exato**.

---

## 7. Auditoria Fiscal

- **Competência `2026-09`:** 2 eventos de aquisição (`PURCHASE`, relevância `INFORMATIONAL`). Status `COMPLETE`, imposto devido `R$ 0,00`.
- **Competência `2026-10`:** 9 eventos de aquisição (`PURCHASE`, relevância `INFORMATIONAL`). Status `COMPLETE`, imposto devido `R$ 0,00`.
- **Fail-Closed:** Como não houve alienação consumada dessas cotas nem histórico de custo anterior corrompido, nenhuma guia DARF fictícia foi gerada.

---

## 8. Persistência em Reinício e Operação Offline

- **Reinício (PARTE X):** O aplicativo Atlas Desktop instalado foi totalmente finalizado e reaberto. PostgreSQL 18 e API local reinicializaram em < 3 segundos. Todas as 7 posições e 11 transações permaneceram perfeitamente intactas.
- **Offline (PARTE Y):** Operação realizada 100% em loopback local (`127.0.0.1`). Nenhuma dependência de rede externa para cálculo de quantidade, preço médio, histórico ou consolidação tributária.
