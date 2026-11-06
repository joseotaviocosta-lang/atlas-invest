# PROJECT ATLAS — APP-15E
# AUDITORIA DE BASELINE HISTÓRICO E ONBOARDING DE CARTEIRA REAL

**Data:** 06 de Novembro de 2026  
**Ambiente:** Desktop Windows Local (`DESKTOP_LOCAL_OWNER`)  
**Banco de Dados:** PostgreSQL 18 Local (`atlas_local` em `127.0.0.1:5434`)  
**API:** Atlas API Local (`http://127.0.0.1:3001` via loopback)  
**Carteira:** Carteira Principal (`00000000-0000-4000-8000-000000000002`)  
**Conta de Custódia:** Custódia Principal (`00000000-0000-4000-8000-000000000005`)  

---

## 1. Inventário das Fontes Históricas Anuais (PARTE A & B)

Foram auditados todos os relatórios anuais consolidados emitidos pela Área do Investidor B3 disponíveis no ambiente do Owner:

| Arquivo Sanitizado | Hash SHA-256 | Período B3 | Estrutura & Abas B3 | Ativos Identificados | Natureza do Relatório |
|---|---|---|---|---|---|
| `relatorio-consolidado-anual-2020.xlsx` | `D0168C7B3EF6E8335E3454FA7B63E9869DC9AB98E662CAFFB56D6F98F72040DD` | 2020 | Posição - Ações, Posição - Fundos | Ações, FIIs | Posição em 31/12/2020 |
| `relatorio-consolidado-anual-2021.xlsx` | `16A1712981C331793F7C85EEE73A9642D8A06C9318D11A5A39683B8F862DEC01` | 2021 | Posição - Ações, Posição - Fundos, Empréstimos | Ações, FIIs | Posição em 31/12/2021 |
| `relatorio-consolidado-anual-2022.xlsx` | `04178C3A27908C193B9E4202B1C89A18891C6F3A61A734CF477A4CC4CB26B84F` | 2022 | Posição - Ações, Posição - Fundos, Empréstimos | Ações, FIIs | Posição em 31/12/2022 |
| `relatorio-consolidado-anual-2023.xlsx` | `D5E2A8018457B97B43C81C036ED3AEF85262E47FA1A9BF388B7E893CB5DDF824` | 2023 | Posição - Ações, Posição - Fundos, Empréstimos | Ações, FIIs, Fiagro | Posição em 31/12/2023 |
| `relatorio-consolidado-anual-2024.xlsx` | `1FEECEB3766B79EDDB3B7C3DE25B8AEF0C8F5FB26C4F500386CC42E95924C4BE` | 2024 | Posição - Ações, Posição - Fundos, Empréstimos | Ações, FIIs, Fiagro, BDRs | Posição em 31/12/2024 |
| `relatorio-consolidado-anual-2025.xlsx` | `7BB575ED2C4E431383420BA3856DB5D8E0D4FE2B7875CBCA8F5DC7A22E608CF7` | 2025 | Posição - Ações, Posição - Fundos, Posição - Empréstimos | 40 ativos | Posição em 31/12/2025 |

### Constatação do Layout Real B3
- As planilhas anuais contêm colunas: `Produto`, `Instituição`, `Conta`, `Código de Negociação`, `Quantidade`, `Preço de Fechamento`, `Valor Atualizado`.
- Elas comprovam **estritamente a custódia/quantidade detida em 31/12** de cada exercício fiscal.
- Elas **NÃO** contêm preço de compra histórico de aquisição (apenas a cotação de mercado de fechamento no último pregão do ano).

---

## 2. Escolha da Âncora e Data-Base (PARTE C & D)

- **Arquivo Escolhido:** `relatorio-consolidado-anual-2025.xlsx`
- **Data-Base da Baseline:** `2025-12-31`
- **Justificativa:** É o relatório mais recente emitido pela B3 anterior ao lote operacional de 2026.
- **Auditoria de Histórico Intermediário (01/01/2026 a 29/09/2026):**
  - O arquivo `negociacao-2026-10-29-11-47-35.xlsx` comprovou 18 compras em 2026 e **zero vendas** de `ITSA4`, `JHSF3` e `SAPR4`.
  - Portanto, a custódia de 31/12/2025 desses 3 ativos permaneceu inalterada até as vendas ocorridas em 07/10/2026 e 08/10/2026.

---

## 3. Modelo de Baseline e Invariantes Arquiteturais (PARTE E & F)

1. **Zero Fabricação de Transações Fictícias:**
   - Em estrita conformidade com a PARTE E & F das diretrizes do Atlas, **nenhuma transação fictícia de compra (`BUY`) foi fabricada em 31/12/2025**.
   - O Atlas utiliza o evento canônico `TRANSFER_IN` (`rawOperation: POSICAO_INICIAL`) sem preço unitário (`unitPrice: undefined`).
2. **Classificação de Custo de Aquisição:**
   - Como o relatório anual traz apenas cotação de mercado de fechamento, a custódia inicial é registrada no ledger e no Portfolio Engine com `costBasisStatus: 'INCOMPLETE'`.
   - O preço médio permanece não-declarado (`—`), impedindo qualquer simulação enganosa.

---

## 4. Persistência Controlada da Baseline (PARTE P)

- **Endpoint:** `POST /api/v1/portfolios/00000000-0000-4000-8000-000000000002/imports/confirm`
- **Source Type:** `B3_ANNUAL_REPORT_XLSX`
- **Decisão:** Importação direcionada para os 3 ativos com vendas pendentes em 2026:
  - `ITSA4` (Linha 15): Quantidade `1200.54`
  - `JHSF3` (Linha 16): Quantidade `600`
  - `SAPR4` (Linha 27): Quantidade `3300`
- **Receipt ID:** `4cbaa430-7041-400f-9fc8-494c43de824b`
  - `totalRows`: 40
  - `created`: 3
  - `skippedByUser`: 37
  - `failed`: 0

---

## 5. Desbloqueio e Confirmação das 3 Vendas (PARTE R, S, T, U)

Após o registro da custódia anterior em 31/12/2025, o arquivo de negociações `negociacao-2026-10-29-11-44-55.xlsx` foi reprocessado via API:

- **Preview:**
  - 11 compras prévias: `DUPLICATE / EXACT_DUPLICATE` (preservadas e ignoradas)
  - 3 vendas pendentes: `READY / NEW` (desbloqueadas pelo estoque inicial comprovado)
  - Erros de validação: 0
- **Confirmação:**
  - **Receipt ID:** `378ab382-2a8f-4b3c-803f-41b4b1707b34`
  - `created`: 3 vendas inseridas no ledger
  - `skippedDuplicates`: 11 compras duplicadas puladas com segurança
  - `failed`: 0
- **Negative Position Gate:**
  - O Portfolio Engine executou o replay canônico de todo o ledger sem disparar `NegativePositionError`.
  - O motor long-only operou com 100% de integridade matemática.

---

## 6. Reconciliação Matemática de Custódia (PARTE V)

Comparação entre a posição derivada pelo motor do Atlas e a custódia oficial emitida pela B3 em `posicao-2026-10-29-11-46-14.xlsx`:

| Ativo | Baseline em 31/12/2025 | Venda em Out/2026 | Saldo Derivado no Atlas | Custódia Oficial B3 (29/10/2026) | Reconciliação |
|---|---|---|---|---|---|
| **ITSA4** | 1.200,54 | 200,00 | **1.000,54** | 1.000 inteiras (+ 0,54 fracionária) | **Exata (100%)** |
| **JHSF3** | 600,00 | 200,00 | **400,00** | 400 inteiras | **Exata (100%)** |
| **SAPR4** | 3.300,00 | 800,00 | **2.500,00** | 2.500 inteiras | **Exata (100%)** |

---

## 7. Validação Fiscal Fail-Closed (PARTE W & X)

Auditoria das consultas fiscais em `GET /api/v1/fiscal/monthly/2026-10` e `/liability`:

- **Receita Bruta de Vendas Rastreada:** R$ 12.304,00 (abaixo do teto de isenção de R$ 20.000 para ações no mês)
  - `SAPR4`: 800 × 8,05 = R$ 6.440,00
  - `ITSA4`: 200 × 16,10 = R$ 3.220,00
  - `JHSF3`: 200 × 13,22 = R$ 2.644,00
- **Status do Cálculo Tributário:** `BLOCKED` (`MISSING_CANONICAL_COST_BASIS`)
- **Imposto Apurado:** R$ 0,00
- **Geração de DARF:** Bloqueada
- **Invariante Respeitada:** Como o custo de aquisição da custódia de abertura em 31/12/2025 é `INCOMPLETE`, o Atlas **recusa-se a calcular ganho de capital com custo zero ou fictício**, operando estritamente em regime *fail-closed*.

---

## 8. Auditoria do Arquivo de Movimentações (PARTE Z & AA)

- **Arquivo:** `movimentacao-2026-10-29-11-45-10.xlsx`
- **Total de Linhas:** 16
- **Natureza:** Trata-se do extrato de liquidação de custódia da B3 (11 `TRANSFER_IN` e 5 `TRANSFER_OUT`) que refletem exatamente a liquidação física das compras e vendas executadas em Outubro/2026.
- **Ação:** Nenhuma movimentação foi duplicada no ledger, pois as pernas econômicas já estão registradas como `BUY` e `SELL`.

---

## 9. Backups e Persistência Física (PARTE O & AD)

| Etapa | Arquivo de Backup | Tamanho (Bytes) | Hash / Validação |
|---|---|---|---|
| Pré-Baseline | `atlas_local_pre_baseline_20261106-142410.sql` | 177.910 | OK (> 0 bytes) |
| Pós-Baseline | `atlas_local_post_baseline_20261106-144946.sql` | 183.687 | OK (> 0 bytes) |

---

## 10. Teste de Reinício e Operação Offline (PARTE AE & AF)

1. **Reinício Completo:**
   - O processo Atlas foi finalizado via `taskkill`.
   - O executável instalado `atlas-app.exe` foi reinicializado.
   - O orquestrador nativo do Tauri subiu o PostgreSQL 18 e a API local em `127.0.0.1:3001`.
   - `/ready` respondeu `ok` com conexão de banco ativa.
2. **Replay do Ledger:**
   - As 17 transações (3 `TRANSFER_IN`, 11 `BUY`, 3 `SELL`) foram integralmente preservadas.
   - A avaliação da carteira derivou com exatidão as 10 posições ativas.
3. **Offline:**
   - Todas as operações ocorreram estritamente em loopback local sem dependência de serviços em nuvem ou internet.
