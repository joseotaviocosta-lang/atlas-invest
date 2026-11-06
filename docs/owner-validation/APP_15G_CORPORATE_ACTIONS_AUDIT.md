# PROJECT ATLAS — APP-15G
# CORPORATE ACTIONS AUDIT & DOMAIN MODEL ASSESSMENT

- **Data de Execução:** 06/11/2026
- **Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)
- **Database:** `atlas_local` (PostgreSQL 18 na porta 5434)
- **Status:** `AUDITED`

---

## 1. RESUMO EXECUTIVO

Esta auditoria mapeou todos os eventos corporativos (bonificações, grupamentos, desdobramentos, mudanças de ticker e subscrições) que afetaram os ativos da carteira do investidor entre 2020 e 2026, cruzando os relatórios anuais da B3 com a planilha de movimentações `movimentacao-2026-10-29-11-47-54.xlsx`.

---

## 2. MATRIZ DE EVENTOS CORPORATIVOS IDENTIFICADOS

| Ativo | Evento | Data Efetiva | Fonte Comprobatória | Quantidade Antes | Quantidade Depois | Impacto no Custo | Suporte no Domínio Atlas |
| :--- | :---: | :---: | :--- | :---: | :---: | :--- | :---: |
| **COGN3** | `BONUS` | 29/12/2025 | `movimentacao-*.xlsx` (L. 580) | 300 | 330 (+30) | Diluição do preço médio sem acréscimo de custo (R$ 1.170 / 330 = R$ 3,5455) | **SUPORTADO** (`BonusTransaction`) |
| **EGIE3** | `BONUS` | 28/11/2025 | `movimentacao-*.xlsx` (L. 661) | 200 | 280 (+80) | Diluição do preço médio (R$ 8.100 / 280 = R$ 28,9286) | **SUPORTADO** (`BonusTransaction`) |
| **SOJA3** | `BONUS` | 22/12/2025 | `movimentacao-*.xlsx` (L. 597) | 900 | 943,76 (+43,76) | Diluição do preço médio (R$ 10.926 / 943,76 = R$ 11,5771). Fração 0,76 liquidada em 13/03/2026 | **SUPORTADO** (`BonusTransaction`) |
| **FLRY3** | `BONUS` | 2023 | Relatório Anual 2023 vs 2022 | 300 | 315 (+15) | Diluição de 5% sobre 300 ações | **SUPORTADO** (`BonusTransaction`) |
| **EZTC3** | `BONUS` | 11/12/2025 | `movimentacao-*.xlsx` (L. 648) | 1.000 | 1.271,56 (+271,56) | Bonificação em ativos. Fração de 0,56 liquidada em 11/02/2026 | **SUPORTADO** (`BonusTransaction`) |
| **ITSA4** | `BONUS` | 22/12/2025 | `movimentacao-*.xlsx` (L. 594) | 1.177 | 1.200,54 (+23,54) | Fração de 0,54 liquidada em 25/02/2026 a R$ 14,658 | **SUPORTADO** (`BonusTransaction`) |
| **IRBR3** | `REVERSE_SPLIT` | 25/01/2023 | Aviso B3 / Relatório Anual 2023 | 700 (ou 891) | 23,33 (ou 29,70) | Fator 30:1. Preço médio multiplicado por 30 (R$ 2,6343 × 30 = R$ 79,03) | **SUPORTADO** (`SplitTransaction` / `REVERSE_SPLIT`) |
| **WIZS3 → WIZC3** | `TICKER_CHANGE` | 2024 | Relatório Anual 2024 vs 2023 | 1.000 | 1.000 (1:1) | Mudança de razão social (Wiz Soluções → Wiz Co). Custo e custódia idênticos | **SUPORTADO** (`asset-successors.ts`) |
| **TRPL4 → ISAE4** | `TICKER_CHANGE` | 2024 | Relatório Anual 2024 vs 2023 | 300 | 300 (1:1) | Mudança de razão social (CTEEP → ISA Energia Brasil). Custo e custódia idênticos | **SUPORTADO** (`asset-successors.ts`) |
| **MALL11 → PMLL11**| `TICKER_CHANGE` | 14/11/2025 | `asset-successors.ts` (B3) | 16 | 16 (1:1) | Transição Genial Malls | **SUPORTADO** (`asset-successors.ts`) |
| **MRFG3 → MBRF3** | `TICKER_CHANGE` | 28/11/2025 | `asset-successors.ts` (B3) | 200 | 200 (1:1) | Transição Marfrig Global Foods | **SUPORTADO** (`asset-successors.ts`) |
| **NUBR33 → ROXO34**| `BDR_RESTRUCTURE`| 2023–2024 | Relatório Anual 2024 vs 2023 | 379 | 499 | Descontinuidade de BDR Nível III e migração para BDR Nível I não-patrocinado. Não é 1:1 direto | **`CORPORATE_ACTION_MODEL_GAP`** |

---

## 3. AUDITORIA DO DOMÍNIO E CAPACIDADE DO MODELO (PARTE F & G)

1. **Eventos Nativamente Suportados no Ledger (`@atlas/domain` e `@atlas/portfolio-engine`):**
   - `BONUS`: Operação canônica com quantidade e opcionalmente `assignedCost`.
   - `SPLIT` e `REVERSE_SPLIT`: Operações puras no ledger via fator decimal arbitrário, auditadas em `SplitTransaction` e `reverseSplitHandler`.
   - `SUBSCRIPTION`: Operação onerosa suportada via preço de exercício factual e quantidade.
   - `AMORTIZATION`: Operação de redução do custo contábil do ativo.
   - `RECEIPT_CONVERSION`: Conversão de recibo de subscrição para o ativo mãe (ex.: `SNAG14` → `SNAG11`).

2. **Mudanças de Ticker (Renames 1:1):**
   - Modeladas com maestria arquitetural através do registro desacoplado de sucessores (`asset-successors.ts`).
   - A invariante de não corromper o ledger é respeitada: o ativo mantém seu `AssetId` imutável, e a equivalência é resolvida nas camadas de importação, cotação e exibição.

3. **Gaps de Modelagem Identificados (`CORPORATE_ACTION_MODEL_GAP`):**
   - **`NUBR33 → ROXO34`**: O programa de BDRs do Nubank envolveu reestruturação societária complexa e opções de entrega de frações de ações no exterior ou migração de nível com fatores distintos. O domínio atual não deve improvisar essa conversão com compra/venda fictícia. Ela fica catalogada como `CORPORATE_ACTION_MODEL_GAP` aguardando especificação de reestruturação de BDRs.
